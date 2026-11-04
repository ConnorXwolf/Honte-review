#!/usr/bin/env bash
# Honte Review · KataGo analysis server installer (Ubuntu 22.04 / 24.04, ARM or x86)
# Usage: sudo bash setup.sh YOUR-PASSWORD
set -e
TOKEN="${1:?usage: sudo bash setup.sh YOUR-PASSWORD}"
DIR="$(cd "$(dirname "$0")" && pwd)"
HOME_DIR=/opt/katago
ARCH=$(uname -m); [ "$ARCH" = "aarch64" ] && CADDY_ARCH=arm64 || CADDY_ARCH=amd64
CORES=$(nproc); THREADS=$(( CORES > 2 ? CORES / 2 : 1 ))

echo "== 1/5 Installing build tools =="
apt-get update
apt-get install -y git cmake g++ make libeigen3-dev libzip-dev zlib1g-dev python3 curl iptables-persistent || \
apt-get install -y git cmake g++ make libeigen3-dev libzip-dev zlib1g-dev python3 curl

echo "== 2/5 Building KataGo (CPU, about 10–20 min)=="
mkdir -p $HOME_DIR && cd $HOME_DIR
[ -d KataGo ] || git clone --depth 1 https://github.com/lightvector/KataGo.git
cd KataGo/cpp
if [ "$CADDY_ARCH" = "amd64" ] && grep -q avx2 /proc/cpuinfo; then AVX="-DUSE_AVX2=1"; else AVX=""; fi
cmake . -DUSE_BACKEND=EIGEN -DNO_GIT_REVISION=1 $AVX
make -j"$CORES"
cp katago $HOME_DIR/katago
cp configs/analysis_example.cfg $HOME_DIR/analysis.cfg

echo "== 3/5 Downloading the KataGo network =="
cd $HOME_DIR
[ -f model.bin.gz ] || curl -L -o model.bin.gz https://media.katagotraining.org/uploaded/networks/models/kata1/kata1-b18c384nbt-s9131461376-d4087399203.bin.gz
cp "$DIR/server.py" $HOME_DIR/server.py

cat > /etc/systemd/system/benshou-katago.service <<EOF
[Unit]
Description=Benshou KataGo server
After=network.target
[Service]
Environment=BENSHOU_TOKEN=$TOKEN
Environment=KATAGO_HOME=$HOME_DIR
Environment=KATAGO_THREADS=$THREADS
ExecStart=/usr/bin/python3 $HOME_DIR/server.py
Restart=always
RestartSec=3
[Install]
WantedBy=multi-user.target
EOF

echo "== 4/5 Setting up HTTPS (Caddy + sslip.io)=="
curl -L -o /usr/local/bin/caddy "https://caddyserver.com/api/download?os=linux&arch=$CADDY_ARCH"
chmod +x /usr/local/bin/caddy
IP=$(curl -s https://api.ipify.org)
DOMAIN="${IP//./-}.sslip.io"
mkdir -p /etc/caddy /var/lib/caddy
cat > /etc/caddy/Caddyfile <<EOF
$DOMAIN {
  reverse_proxy 127.0.0.1:8765
}
EOF
cat > /etc/systemd/system/caddy.service <<EOF
[Unit]
Description=Caddy
After=network.target
[Service]
Environment=XDG_DATA_HOME=/var/lib/caddy
Environment=XDG_CONFIG_HOME=/var/lib/caddy
ExecStart=/usr/local/bin/caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
Restart=always
[Install]
WantedBy=multi-user.target
EOF

echo "== 5/5 Opening the firewall and starting =="
iptables -I INPUT 1 -p tcp --dport 80 -j ACCEPT
iptables -I INPUT 1 -p tcp --dport 443 -j ACCEPT
command -v netfilter-persistent >/dev/null && netfilter-persistent save || true
systemctl daemon-reload
systemctl enable --now benshou-katago caddy
systemctl restart benshou-katago caddy

echo ""
echo "Done! In Honte Review open a game → AI win rate → Settings → Self-hosted server, and enter:"
echo "  Server URL: https://$DOMAIN"
echo "  Password: $TOKEN"
echo "Check: open https://$DOMAIN in a browser — "Honte Review KataGo server is running" means it works (the first visit may take a minute while the certificate is issued)."
