#!/usr/bin/env bash
set -euo pipefail

HOSTNAME_ARG="${1:?uso: configure-vps-root.sh <hostname>}"

cat > /etc/systemd/system/lc-banco-horas.service <<EOF
[Unit]
Description=LC Banco de Horas
After=network.target

[Service]
Type=simple
User=sergio
WorkingDirectory=/home/sergio/apps/lc-banco-horas
Environment=PATH=/home/sergio/.local/node/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
ExecStart=/home/sergio/.local/node/bin/node /home/sergio/apps/lc-banco-horas/server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/nginx/sites-available/lc-banco-horas <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${HOSTNAME_ARG};

    client_max_body_size 20m;

    location / {
        proxy_pass http://127.0.0.1:3100;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
EOF

rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/lc-banco-horas /etc/nginx/sites-enabled/lc-banco-horas

systemctl daemon-reload
systemctl enable --now lc-banco-horas
nginx -t
systemctl restart nginx
