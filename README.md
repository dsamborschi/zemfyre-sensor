## OS Update

sudo apt update
sudo apt upgrade -y

sudo reboot

## Network Setup 

# wifi

To connect your Raspberry Pi to a Wi-Fi network from the command line, use:

nmcli device wifi list
nmcli device wifi connect "<SSID>" password "<password>"


Replace `SSID_NAME` and `PASSWORD` with your Wi-Fi network's name and password.

# Set static IP for eth0 (change Wired connection 1 to your eth0 name)

sudo nmcli connection modify "Wired connection 1" ipv4.addresses 192.168.0.156/24
sudo nmcli connection modify "Wired connection 1" ipv4.method manual
sudo nmcli connection modify "Wired connection 1" ipv4.gateway ""
sudo nmcli connection modify "Wired connection 1" ipv4.dns ""

sudo nmcli connection up eth0

sudo nmcli connection down "Wired connection 1"
sudo nmcli connection up "Wired connection 1"



## Docker setup

Installing Docker on a Raspberry Pi is straightforward. There is a simple script to run, that will detect your system and architecture, and install everything for you.

1) Here is the command:

curl -fsSL https://get.docker.com -o get-docker.sh

2) Run the script with the help of the below command:

sudo sh get-docker.sh


3) Run Docker commands with your current user
The only thing I did to allow the main user to use Docker without sudo was to add it to the docker group. I don’t know exactly why they give other instructions, but it wasn’t necessary in my case.

So, here is the command to add the current user to the docker group:


usermod -aG docker $USER


4) Try to see the hello-world container:

docker ps


## Github


1) Get github sources

git clone https://dsamborschi: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@github.com/dsamborschi/IotServer.git

2) Update from hithub to overwrite the local git (do it proper way if you have time)
sudo git reset --hard
git full

3) Run docker-compose and build the containers

sudo docker compose up -d

## VNC server setup

sudo apt install realvnc-vnc-server
sudo systemctl enable vncserver-x11-serviced.service
sudo systemctl start vncserver-x11-serviced.service



## Other


# Resert Grafana password


docker exec -ti 7dbfceb3d513 grafana-cli admin reset-admin-password  Password123!

# PI start up diagnostics

1) Install Zenity if it’s not already installed:

sudo apt-get install zenity

2) Save the script as docker_diagnostics.sh

chmod +x docker_diagnostics.sh

3) Add to startup by adding the following line to your /etc/rc.local (before the exit 0 line)

/path/to/docker_diagnostics.sh &
OR
echo "@/path/to/docker_diagnostics.sh" >> ~/.config/lxsession/LXDE-pi/autostart



# Install ngrok

token:

<YOUR_AUTH_TOKEN> = 2oP34NN5iZ9P7Oyh02QVAabZofB_5LsyoDGqMQ7XEyRh4axbn

1) Open a terminal on your Raspberry Pi and download the latest version of Ngrok for Linux ARM.

wget https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-linux-arm64.tgz

2) Use unzip to extract the downloaded zip file.

sudo tar -xvzf ~/ngrok-v3-stable-linux-arm64.tgz -C /usr/local/bin

3) Go to the Ngrok website and sign up or log in to get your authentication token. Add the token to the congig file:

ngrok config add-authtoken <YOUR_AUTH_TOKEN>

4) To start a tcp tunnel, use the command:

ngrok tcp 22

5) Create a new systemd service file to run the ngrok command as a service:

sudo nano /etc/systemd/system/ngrok.service

6) Paste the following content into the file, replacing <YOUR_USERNAME> with your actual username and <YOUR_AUTH_TOKEN> with your ngrok authentication token:


[Unit]
Description=Ngrok Tunnel
After=network.target
[Service]
Type=simple
User=<YOUR_USERNAME>
WorkingDirectory=/home/<YOUR_USERNAME>
ExecStart=/usr/local/bin/ngrok <PROTOCOL> <PORT>
Restart=on-failure
Environment=NGROK_AUTH_TOKEN=<YOUR_AUTH_TOKEN>
[Install]
WantedBy=multi-user.target

7) Set the authentication token as an environment variable

You can set the authentication token as an environment variable by running the following command:

export NGROK_AUTH_TOKEN=<YOUR_AUTH_TOKEN>

8) Enable the service to start on boot:

sudo systemctl enable ngrok

9) Then, start the service:

sudo systemctl start ngrok


10) You can check the status of the service with:

sudo systemctl status ngrok




# Disable Screen Blanking

Open a terminal.

1) Edit the lightdm.conf file:

   sudo nano /etc/lightdm/lightdm.conf

2) Find the [Seat:*] section (you may need to scroll down a bit).
Look for the line with xserver-command=X, and modify it to disable screen blanking:
    
  xserver-command=X -s 0 -dpms



  GRAFANA

  1) reset the admin password 

  docker exec -it grafana grafana-cli admin reset-admin-password <your new password>


  INFLUX

  3e0ieOHkbgjzh1JCwBuqQBlftOwAFn2SOnn_XGPKmCTFZewHAWns2bwXqF-4RBFY8YBgS1fGUY978Sl8G2dTPg==

  curl --request GET "http://influxdb:8086/api/v2/buckets" \
--header "Authorization: Token rbFJlMmKXhg23cw1Ns9FF63i4MR2k8P9FmgEjX3ZhpnPlthhf85vkIuG0urN-O-CNEN5GdWQsL2V1yEae1Nk9A=="










