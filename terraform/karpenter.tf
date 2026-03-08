# Karpenter Controller IAM Role
resource "aws_iam_role" "karpenter_controller" {
  name = "${var.project_name}-karpenter-controller"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRoleWithWebIdentity"
      Effect = "Allow"
      Principal = {
        Federated = aws_iam_openid_connect_provider.eks.arn
      }
      Condition = {
        StringEquals = {
          "${replace(aws_iam_openid_connect_provider.eks.url, "https://", "")}:sub" = "system:serviceaccount:karpenter:karpenter"
          "${replace(aws_iam_openid_connect_provider.eks.url, "https://", "")}:aud" = "sts.amazonaws.com"
        }
      }
    }]
  })
}

resource "aws_iam_role_policy" "karpenter_controller" {
  name = "${var.project_name}-karpenter-controller-policy"
  role = aws_iam_role.karpenter_controller.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ec2:CreateFleet",
          "ec2:CreateLaunchTemplate",
          "ec2:CreateTags",
          "ec2:DescribeAvailabilityZones",
          "ec2:DescribeImages",
          "ec2:DescribeInstances",
          "ec2:DescribeInstanceTypeOfferings",
          "ec2:DescribeInstanceTypes",
          "ec2:DescribeLaunchTemplates",
          "ec2:DescribeSecurityGroups",
          "ec2:DescribeSpotPriceHistory",
          "ec2:DescribeSubnets",
          "ec2:DeleteLaunchTemplate",
          "ec2:RunInstances",
          "ec2:TerminateInstances",
          "pricing:GetProducts",
          "ssm:GetParameter"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "eks:DescribeCluster"
        ]
        Resource = aws_eks_cluster.main.arn
      },
      {
        Effect = "Allow"
        Action = [
          "iam:PassRole"
        ]
        Resource = aws_iam_role.karpenter_node.arn
      },
      {
        Effect = "Allow"
        Action = [
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes",
          "sqs:GetQueueUrl",
          "sqs:ReceiveMessage"
        ]
        Resource = aws_sqs_queue.karpenter.arn
      }
    ]
  })
}

# Karpenter Node IAM Role
resource "aws_iam_role" "karpenter_node" {
  name = "${var.project_name}-karpenter-node"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "ec2.amazonaws.com"
      }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "karpenter_node_policies" {
  for_each = toset([
    "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy",
    "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy",
    "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly",
    "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
  ])

  policy_arn = each.value
  role       = aws_iam_role.karpenter_node.name
}

resource "aws_iam_instance_profile" "karpenter_node" {
  name = "${var.project_name}-karpenter-node"
  role = aws_iam_role.karpenter_node.name
}

# SQS Queue for Spot Interruption
resource "aws_sqs_queue" "karpenter" {
  name                      = "${var.project_name}-karpenter"
  message_retention_seconds = 300
  sqs_managed_sse_enabled   = true
}

resource "aws_sqs_queue_policy" "karpenter" {
  queue_url = aws_sqs_queue.karpenter.url

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Service = [
          "events.amazonaws.com",
          "sqs.amazonaws.com"
        ]
      }
      Action   = "sqs:SendMessage"
      Resource = aws_sqs_queue.karpenter.arn
    }]
  })
}

# EventBridge Rules for Spot Interruption
resource "aws_cloudwatch_event_rule" "karpenter_spot_interruption" {
  name        = "${var.project_name}-karpenter-spot-interruption"
  description = "Karpenter Spot Instance Interruption Warning"

  event_pattern = jsonencode({
    source      = ["aws.ec2"]
    detail-type = ["EC2 Spot Instance Interruption Warning"]
  })
}

resource "aws_cloudwatch_event_target" "karpenter_spot_interruption" {
  rule      = aws_cloudwatch_event_rule.karpenter_spot_interruption.name
  target_id = "KarpenterSpotInterruptionQueue"
  arn       = aws_sqs_queue.karpenter.arn
}

resource "aws_cloudwatch_event_rule" "karpenter_rebalance" {
  name        = "${var.project_name}-karpenter-rebalance"
  description = "Karpenter Rebalance Recommendation"

  event_pattern = jsonencode({
    source      = ["aws.ec2"]
    detail-type = ["EC2 Instance Rebalance Recommendation"]
  })
}

resource "aws_cloudwatch_event_target" "karpenter_rebalance" {
  rule      = aws_cloudwatch_event_rule.karpenter_rebalance.name
  target_id = "KarpenterRebalanceQueue"
  arn       = aws_sqs_queue.karpenter.arn
}

resource "aws_cloudwatch_event_rule" "karpenter_instance_state_change" {
  name        = "${var.project_name}-karpenter-instance-state-change"
  description = "Karpenter Instance State Change"

  event_pattern = jsonencode({
    source      = ["aws.ec2"]
    detail-type = ["EC2 Instance State-change Notification"]
  })
}

resource "aws_cloudwatch_event_target" "karpenter_instance_state_change" {
  rule      = aws_cloudwatch_event_rule.karpenter_instance_state_change.name
  target_id = "KarpenterInstanceStateChangeQueue"
  arn       = aws_sqs_queue.karpenter.arn
}

# Outputs
output "karpenter_controller_role_arn" {
  value = aws_iam_role.karpenter_controller.arn
}

output "karpenter_node_role_name" {
  value = aws_iam_role.karpenter_node.name
}

output "karpenter_node_instance_profile_name" {
  value = aws_iam_instance_profile.karpenter_node.name
}

output "karpenter_queue_name" {
  value = aws_sqs_queue.karpenter.name
}
