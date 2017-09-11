
==could be optional:
edit sudo nano /etc/apt/sources.list
add:
deb http://archive.raspberrypi.org/debian/ jessie main staging
deb-src http://archive.raspberrypi.org/debian/ jessie main staging
____

dependencies:
sudo apt-get install pi-bluetooth

sudo usermod -G bluetooth -a volumio

apt-get install bluez
#apt-get install libbluetooth-dev


____


