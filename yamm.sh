#!/bin/bash
clear

if [[ "$OSTYPE" == "linux-gnu"* ]]; then
  echo "We are running on Linux"
  OS="LINUX"
elif [[ "$OSTYPE" == "darwin"* ]]; then
  echo "We are running on MacOS"
  OS="MACOS"
elif [[ "$OSTYPE" == "cygwin" ]]; then
  echo "We are running on Cygwin"
  OS=""
elif [[ "$OSTYPE" == "msys" ]]; then
  echo "We are running on Msys"
  OS=""
elif [[ "$OSTYPE" == "win32" ]]; then
  echo "We are running on Windows"
  OS=""
elif [[ "$OSTYPE" == "freebsd"* ]]; then
  echo "We are running on FreeBSD"
  OS=""
else
  echo "We are running on Undetermined OS"
  OS=""
fi

if [[ "$OS" == "" ]]; then
  echo "Unsupported OS. Exiting"
  exit -1
fi

echo "Adding static routes (might require sudo permitions)"
if [[ "$OS" == "LINUX" ]]; then
  sudo iptables -t nat -I OUTPUT -p tcp -o lo --dport  80 -j REDIRECT --to-ports 4242
  sudo iptables -t nat -I OUTPUT -p tcp -o lo --dport 443 -j REDIRECT --to-ports 4243
fi
echo "Running YAMM"
LOG_LEVEL=debug bin/node-linux dist/src/app.js
echo "Cleaning up static routes (might require sudo permitions)"
if [[ "$OS" == "LINUX" ]]; then
  sudo iptables -t nat -D OUTPUT -p tcp -o lo --dport  80 -j REDIRECT --to-ports 4242
  sudo iptables -t nat -D OUTPUT -p tcp -o lo --dport 443 -j REDIRECT --to-ports 4243
fi
