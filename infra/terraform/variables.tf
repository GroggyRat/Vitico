variable "project" {
  type    = string
  default = "vitico"
}

variable "environment" {
  description = "Short environment name, e.g. prod or staging."
  type        = string
  default     = "prod"
}

variable "region" {
  description = "Sydney is the nearest AWS region to Fiji."
  type        = string
  default     = "ap-southeast-2"
}

variable "domain_name" {
  description = "Public hostname of the app, e.g. order.vitico.com.fj."
  type        = string
}

variable "certificate_arn" {
  description = "ACM certificate for domain_name in var.region, used by the load balancer. Leave empty to have Terraform request one (add the DNS record from the dns_records output to validate it)."
  type        = string
  default     = ""
}

variable "cloudfront_certificate_arn" {
  description = "ACM certificate for domain_name in us-east-1. Leave empty to skip CloudFront and point DNS at the load balancer."
  type        = string
  default     = ""
}

variable "route53_zone_id" {
  description = "Hosted zone to create DNS records in. Leave empty to manage DNS elsewhere (see outputs)."
  type        = string
  default     = ""
}

variable "email_domain" {
  description = "Domain emails are sent from (verified in SES), e.g. vitico.com.fj."
  type        = string
}

variable "email_from" {
  description = "From header for emails."
  type        = string
  default     = "VITICO Wholesale <orders@vitico.com.fj>"
}

variable "sms_sender_id" {
  type    = string
  default = "VITICO"
}

variable "alarm_email" {
  description = "Where CloudWatch alarms are emailed. Leave empty for no alarm emails."
  type        = string
  default     = ""
}

variable "image_tag" {
  description = "Image tag the services run. The deploy workflow pushes :latest and forces a new deployment."
  type        = string
  default     = "latest"
}

variable "vpc_cidr" {
  type    = string
  default = "10.40.0.0/16"
}

variable "db_instance_class" {
  type    = string
  default = "db.t4g.small"
}

variable "db_allocated_storage" {
  description = "GB. Storage grows automatically up to 5x this."
  type        = number
  default     = 30
}

variable "db_multi_az" {
  type    = bool
  default = true
}

variable "web_cpu" {
  type    = number
  default = 512
}

variable "web_memory" {
  type    = number
  default = 1024
}

variable "web_min_count" {
  type    = number
  default = 2
}

variable "web_max_count" {
  type    = number
  default = 6
}

variable "worker_count" {
  description = "The worker is safe to run as several copies; one is enough for normal load."
  type        = number
  default     = 1
}

variable "github_repository" {
  description = "owner/repo allowed to deploy through GitHub Actions OIDC. Leave empty to skip the deploy role."
  type        = string
  default     = ""
}

variable "create_github_oidc_provider" {
  description = "Create the GitHub OIDC provider (only once per AWS account)."
  type        = bool
  default     = true
}

variable "odoo_url" {
  description = "Odoo base URL, e.g. https://vitico.odoo.com. Leave empty to run without Odoo. The API key goes in the app secret."
  type        = string
  default     = ""
}

variable "odoo_db" {
  type    = string
  default = ""
}

# ─── Cost controls (see terraform.tfvars.budget.example) ─────────────────────

variable "use_nat_gateway" {
  description = "true: tasks run in private subnets behind a NAT gateway (~US$35/month). false: tasks get public IPs in public subnets; their security group still only accepts traffic from the load balancer."
  type        = bool
  default     = true
}

variable "container_insights" {
  description = "Detailed ECS metrics in CloudWatch (extra cost)."
  type        = bool
  default     = true
}

variable "db_performance_insights" {
  type    = bool
  default = true
}

variable "db_backup_days" {
  type    = number
  default = 14
}

variable "worker_cpu" {
  type    = number
  default = 256
}

variable "worker_memory" {
  type    = number
  default = 512
}

variable "monthly_budget_usd" {
  description = "Emails alarm_email when actual or forecast monthly spend passes 50%, 80% and 100% of this. 0 turns the budget off."
  type        = number
  default     = 0
}
