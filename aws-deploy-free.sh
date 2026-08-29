#!/bin/bash
# AWS EC2 User Data Script (Amazon Linux 2 / 2023 or Ubuntu)
# This script sets up a 1GB RAM EC2 instance (t2.micro/t3.micro) to run the HRMS application.

# 1. System Updates & Docker Installation
if [ -f /etc/os-release ]; then
    . /etc/os-release
    if [ "$ID" = "ubuntu" ]; then
        sudo apt-get update -y
        sudo apt-get install -y docker.io docker-compose git
        sudo systemctl enable docker
        sudo systemctl start docker
    else
        sudo yum update -y
        sudo yum install -y docker git
        sudo service docker start
        sudo usermod -a -G docker ec2-user
        sudo chkconfig docker on
        
        # Install docker-compose
        sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
        sudo chmod +x /usr/local/bin/docker-compose
    fi
fi

# 2. Add Swap Space (CRITICAL for 1GB RAM instances to prevent OOM crashes)
if [ ! -f /swapfile ]; then
    sudo fallocate -l 2G /swapfile
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile
    echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
    # Optimize swappiness for performance
    echo 'vm.swappiness=10' | sudo tee -a /etc/sysctl.conf
    sudo sysctl -p
fi

# 3. Clone Repository (Replace with actual Git repository URL)
# cd /home/ec2-user
# git clone https://github.com/your-org/hrmsnew.git
# cd hrmsnew

# 4. Generate .env.prod file automatically
# cat <<EOF > .env.prod
# POSTGRES_PASSWORD=$(openssl rand -base64 12)
# EOF

# 5. Start the Free Tier Lite Architecture
# docker-compose --env-file .env.prod -f docker-compose.free.yml up -d --build
