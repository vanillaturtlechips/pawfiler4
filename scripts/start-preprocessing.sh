#!/bin/bash
# EC2 Spot 인스턴스 시작 및 전처리 실행

INSTANCE_TYPE="g4dn.xlarge"
AMI_ID="ami-0c9c942bd7bf113a2"  # Deep Learning AMI GPU PyTorch (ap-northeast-2)
KEY_NAME="your-key-name"
SECURITY_GROUP="sg-xxxxx"
SUBNET_ID="subnet-xxxxx"

echo "Starting EC2 Spot instance..."

INSTANCE_ID=$(aws ec2 run-instances \
  --region ap-northeast-2 \
  --instance-type $INSTANCE_TYPE \
  --image-id $AMI_ID \
  --key-name $KEY_NAME \
  --security-group-ids $SECURITY_GROUP \
  --subnet-id $SUBNET_ID \
  --instance-market-options '{"MarketType":"spot","SpotOptions":{"MaxPrice":"0.20","SpotInstanceType":"one-time"}}' \
  --block-device-mappings '[{"DeviceName":"/dev/sda1","Ebs":{"VolumeSize":500,"VolumeType":"gp3"}}]' \
  --iam-instance-profile Name=EC2-S3-Access \
  --user-data file://setup.sh \
  --query 'Instances[0].InstanceId' \
  --output text)

echo "Instance ID: $INSTANCE_ID"
echo "Waiting for instance to start..."

aws ec2 wait instance-running --instance-ids $INSTANCE_ID --region ap-northeast-2

PUBLIC_IP=$(aws ec2 describe-instances \
  --instance-ids $INSTANCE_ID \
  --region ap-northeast-2 \
  --query 'Reservations[0].Instances[0].PublicIpAddress' \
  --output text)

echo "Instance running at: $PUBLIC_IP"
echo "SSH: ssh -i ~/.ssh/$KEY_NAME.pem ubuntu@$PUBLIC_IP"
echo ""
echo "To monitor progress:"
echo "  ssh ubuntu@$PUBLIC_IP 'tail -f /tmp/preprocess.log'"
