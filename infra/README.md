# Infrastructure (AWS)

Terraform for running VITICO Wholesale in AWS Sydney (`ap-southeast-2`, the nearest region to Fiji).

## What it creates

| Piece | AWS service |
| --- | --- |
| Web app (2 to 6 tasks, CPU autoscaling) and worker (1 task) | ECS Fargate, one image from ECR |
| Database | RDS Postgres 16, encrypted, Multi-AZ, 14 days of backups, private subnets only |
| Payment receipts | Private S3 bucket, versioned and encrypted, served only through the app |
| HTTPS | Application Load Balancer (TLS 1.2+), optional CloudFront in front for static assets |
| Email | SES domain identity with DKIM and a configuration set that suppresses bounces |
| SMS | SNS transactional SMS with sender ID |
| Secrets | Secrets Manager: database URL, plus one secret for Odoo / Twilio / web push keys |
| Logs and alarms | CloudWatch logs (30 days) and alarms for 5xx errors, unhealthy tasks, DB CPU and storage |
| Deploys | GitHub Actions role through OIDC (no stored AWS keys) |

## First-time setup

1. Create an S3 bucket for Terraform state, and ACM certificates for the app's hostname: one in
   `ap-southeast-2` and, to use CloudFront, one in `us-east-1`.
2. Copy `terraform/terraform.tfvars.example` to `terraform/terraform.tfvars` and fill it in.
3. Apply:

   ```bash
   cd infra/terraform
   terraform init -backend-config="bucket=<state bucket>" -backend-config="key=prod/terraform.tfstate" \
     -backend-config="region=ap-southeast-2" -backend-config="use_lockfile=true"
   terraform apply
   ```

4. DNS: if `route53_zone_id` is empty, point the hostname at `dns_target` and add the
   `ses_dkim_records` (both are Terraform outputs).
5. SES starts in sandbox mode. Request production access in the SES console before go-live.
   SNS SMS also has a low default monthly spend limit; raise it in the SNS console.
6. Fill in the keys in the app secret (`app_secret_arn` output). Generate web push keys with
   `npx web-push generate-vapid-keys`. Leave a key empty to switch that integration off.
7. In GitHub, create an environment with the same name as Terraform's `environment` (`prod` or
   `staging`; add required reviewers if you want a manual approval step), then set these
   **repository variables** from the Terraform outputs:

   | Variable | Output |
   | --- | --- |
   | `DEPLOY_ENVIRONMENT` | the environment name, e.g. `staging` (defaults to `prod`) |
   | `AWS_REGION` | `ap-southeast-2` |
   | `AWS_DEPLOY_ROLE_ARN` | `deploy_role_arn` |
   | `ECR_REPOSITORY_URL` | `ecr_repository_url` |
   | `ECS_CLUSTER` | `ecs_cluster` |
   | `WEB_SERVICE` | `web_service` |
   | `WORKER_SERVICE` | `worker_service` |
   | `MIGRATE_TASK` | `migrate_task_definition` |

8. Run the **Deploy** workflow. It builds the image, runs `prisma migrate deploy` as a one-off
   task, and rolls both services. After that it runs on its own whenever CI passes on `main`.
9. Bootstrap the database once: regions, tiers, container sizes and the first super admin
   (no fake data). It runs from the migration task definition:

   ```bash
   aws ecs run-task --cluster vitico-prod --task-definition vitico-prod-migrate --launch-type FARGATE \
     --network-configuration "$(aws ecs describe-services --cluster vitico-prod --services vitico-prod-worker \
     --query 'services[0].networkConfiguration' --output json)" \
     --overrides '{"containerOverrides":[{"name":"migrate","command":["pnpm","--filter","@vitico/db","bootstrap"],
       "environment":[{"name":"BOOTSTRAP_ADMIN_EMAIL","value":"it@vitico.com.fj"},{"name":"BOOTSTRAP_ADMIN_NAME","value":"Your Name"}]}]}'
   ```

   Then open the app, choose "Forgot password" and set a password from the emailed link. Add
   products, payment details and the rest of the staff from the admin.

## Running things by hand

```bash
# A shell in a running web task
aws ecs execute-command --cluster vitico-prod --task <task id> --container web --interactive --command sh

# Migrations only
aws ecs run-task --cluster vitico-prod --task-definition vitico-prod-migrate --launch-type FARGATE \
  --network-configuration "$(aws ecs describe-services --cluster vitico-prod --services vitico-prod-worker \
  --query 'services[0].networkConfiguration' --output json)"
```

## Budget mode (trial accounts and staging)

Start from `terraform/terraform.tfvars.budget.example` instead. It drops the NAT gateway (tasks get
public IPs; their security group still only accepts the load balancer), uses one web task, a
single `db.t4g.micro` database, no Container Insights or Performance Insights, and sets a monthly
budget alert. Expect about US$55 to 65 a month.

To pause while you're not testing (the load balancer, IPs and storage still cost a little):

```bash
aws ecs update-service --cluster vitico-staging --service vitico-staging-web --desired-count 0
aws ecs update-service --cluster vitico-staging --service vitico-staging-worker --desired-count 0
aws rds stop-db-instance --db-instance-identifier vitico-staging   # AWS restarts it after 7 days
```

Resume with `aws rds start-db-instance ...`, then set the desired counts back to 1.
`terraform destroy` removes everything (turn off `deletion_protection` on the database first).

## Costs to know about

The biggest fixed costs are the Multi-AZ database, the NAT gateway and the load balancer. For a
staging environment set `db_multi_az = false`, `db_instance_class = "db.t4g.micro"` and
`web_min_count = 1`.
