output "app_url" {
  value = "https://${var.domain_name}"
}

output "dns_target" {
  description = "Point domain_name here (CNAME or alias) if Route 53 isn't managed by this stack."
  value       = local.cdn ? aws_cloudfront_distribution.main[0].domain_name : aws_lb.main.dns_name
}

output "ses_dkim_records" {
  description = "CNAME records to add for SES DKIM if Route 53 isn't managed by this stack."
  value       = [for t in aws_sesv2_email_identity.domain.dkim_signing_attributes[0].tokens : "${t}._domainkey.${var.email_domain} CNAME ${t}.dkim.amazonses.com"]
}

output "ecr_repository_url" {
  value = aws_ecr_repository.app.repository_url
}

output "ecs_cluster" {
  value = aws_ecs_cluster.main.name
}

output "web_service" {
  value = aws_ecs_service.web.name
}

output "worker_service" {
  value = aws_ecs_service.worker.name
}

output "migrate_task_definition" {
  value = aws_ecs_task_definition.migrate.family
}

output "deploy_role_arn" {
  description = "Set as the AWS_DEPLOY_ROLE_ARN variable of the GitHub environment."
  value       = one(aws_iam_role.deploy[*].arn)
}

output "app_secret_arn" {
  description = "Fill in ODOO_API_KEY, TWILIO_*, VAPID_* here."
  value       = aws_secretsmanager_secret.app.arn
}

output "uploads_bucket" {
  value = aws_s3_bucket.uploads.bucket
}
