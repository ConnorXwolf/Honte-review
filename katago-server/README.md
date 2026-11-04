# Self-hosted KataGo server (optional)

Only needed if you'd rather not run KataGo in the browser. Tested on Oracle Cloud's free ARM VM (4 OCPU, 24 GB).

1. Create an Ubuntu 22.04/24.04 VM and open ports 80 and 443.
2. SSH in, then:
   ```
   sudo apt-get update && sudo apt-get install -y git
   git clone https://github.com/ConnorXwolf/honte-review.git
   cd honte-review/katago-server
   sudo bash setup.sh YOUR-PASSWORD
   ```
   Building KataGo takes 15–25 minutes. The script prints the server URL (`https://1-2-3-4.sslip.io`) and password.
3. In Honte Review, open a game → **AI win rate → Settings** → Engine **Self-hosted server**. Enter the URL and password, then **Save and test**.

Maintenance: `sudo systemctl status benshou-katago caddy` · restart with `sudo systemctl restart benshou-katago`.
