terraform {
  required_version = ">= 1.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.80"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # State lives in S3 with locking. Pass the bucket and key at init, e.g.
  #   terraform init -backend-config="bucket=vitico-tfstate" -backend-config="key=prod/terraform.tfstate" \
  #     -backend-config="region=ap-southeast-2" -backend-config="use_lockfile=true"
  backend "s3" {}
}

provider "aws" {
  region = var.region
  default_tags {
    tags = {
      Project     = var.project
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

locals {
  name = "${var.project}-${var.environment}"
}
