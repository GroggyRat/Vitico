# ─── Database ────────────────────────────────────────────────────────────────

resource "random_password" "db" {
  length  = 32
  special = false
}

resource "aws_db_subnet_group" "main" {
  name       = local.name
  subnet_ids = aws_subnet.private[*].id
}

resource "aws_db_parameter_group" "main" {
  name   = local.name
  family = "postgres16"
  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }
  parameter {
    name  = "timezone"
    value = "UTC"
  }
}

resource "aws_db_instance" "main" {
  identifier                   = local.name
  engine                       = "postgres"
  engine_version               = "16"
  instance_class               = var.db_instance_class
  allocated_storage            = var.db_allocated_storage
  max_allocated_storage        = var.db_allocated_storage * 5
  storage_type                 = "gp3"
  storage_encrypted            = true
  db_name                      = "vitico"
  username                     = "vitico"
  password                     = random_password.db.result
  db_subnet_group_name         = aws_db_subnet_group.main.name
  parameter_group_name         = aws_db_parameter_group.main.name
  vpc_security_group_ids       = [aws_security_group.db.id]
  multi_az                     = var.db_multi_az
  publicly_accessible          = false
  backup_retention_period      = var.db_backup_days
  backup_window                = "14:00-15:00" # 02:00 to 03:00 Fiji time
  maintenance_window           = "sun:15:00-sun:16:00"
  auto_minor_version_upgrade   = true
  deletion_protection          = true
  skip_final_snapshot          = false
  final_snapshot_identifier    = "${local.name}-final"
  copy_tags_to_snapshot        = true
  performance_insights_enabled = var.db_performance_insights
}

# ─── Uploads (payment receipts) ──────────────────────────────────────────────

resource "aws_s3_bucket" "uploads" {
  bucket_prefix = "${local.name}-uploads-"
}

resource "aws_s3_bucket_public_access_block" "uploads" {
  bucket                  = aws_s3_bucket.uploads.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "uploads" {
  bucket = aws_s3_bucket.uploads.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "uploads" {
  bucket = aws_s3_bucket.uploads.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_versioning" "uploads" {
  bucket = aws_s3_bucket.uploads.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "uploads" {
  bucket = aws_s3_bucket.uploads.id
  rule {
    id     = "expire-old-versions"
    status = "Enabled"
    filter {}
    noncurrent_version_expiration {
      noncurrent_days = 90
    }
  }
}

resource "aws_s3_bucket_policy" "uploads_tls" {
  bucket = aws_s3_bucket.uploads.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "DenyInsecureTransport"
      Effect    = "Deny"
      Principal = "*"
      Action    = "s3:*"
      Resource  = [aws_s3_bucket.uploads.arn, "${aws_s3_bucket.uploads.arn}/*"]
      Condition = { Bool = { "aws:SecureTransport" = "false" } }
    }]
  })
  depends_on = [aws_s3_bucket_public_access_block.uploads]
}

# ─── Secrets ─────────────────────────────────────────────────────────────────

resource "aws_secretsmanager_secret" "database_url" {
  name                    = "${local.name}/database-url"
  recovery_window_in_days = 7
}

resource "aws_secretsmanager_secret_version" "database_url" {
  secret_id     = aws_secretsmanager_secret.database_url.id
  secret_string = "postgresql://${aws_db_instance.main.username}:${random_password.db.result}@${aws_db_instance.main.address}:${aws_db_instance.main.port}/${aws_db_instance.main.db_name}?sslmode=require"
}

locals {
  # Every key must exist (ECS refuses to start a task that references a missing key).
  # Empty values mean "not configured": the app then skips Odoo, Twilio or web push.
  app_secret_keys = ["ODOO_API_KEY", "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM", "VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY"]
}

resource "aws_secretsmanager_secret" "app" {
  name                    = "${local.name}/app"
  description             = "Integration keys. Set values in the console or CLI; Terraform only creates the keys."
  recovery_window_in_days = 7
}

resource "aws_secretsmanager_secret_version" "app" {
  secret_id     = aws_secretsmanager_secret.app.id
  secret_string = jsonencode({ for k in local.app_secret_keys : k => "" })
  lifecycle {
    ignore_changes = [secret_string]
  }
}
