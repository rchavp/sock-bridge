#!/bin/bash

TOGGLE_DNS_PATCH () {
  echo "Checking local DNS via hosts file"

  HOSTS_FILE="/etc/hosts"
  HOSTS_FILE_NEW="${HOSTS_FILE}_NEW"
  HOSTS_FILE_BACKUP="${HOSTS_FILE}_BACKUP"
  CURRENT_PATCH="$(grep '#added by yamm-begin' $HOSTS_FILE)"

  if [[ -f "$HOSTS_FILE_BACKUP" ]]; then
    echo "Backup for hosts file already exists ($HOSTS_FILE_BACKUP)"
  else
    echo "Creating backup for hosts file as $HOSTS_FILE_BACKUP"
    cp $HOSTS_FILE $HOSTS_FILE_BACKUP
  fi

  if [ "$CURRENT_PATCH" == "" ]
  then
    echo "DNS patch not found. Adding it."
    echo "#added by yamm-begin" >> $HOSTS_FILE
    echo "127.0.0.1    sandbox.tradeshift.com" >> $HOSTS_FILE
    echo "#added by yamm-end" >> $HOSTS_FILE
  else  
    echo "DNS patch found. Removing it."
    PATCHED=$( cat $HOSTS_FILE | tr "\n" "\f" | $SEDCMD -r "s/#added by yamm-begin.*?#added by yamm-end\f//" | tr "\f" "\n" > $HOSTS_FILE_NEW )
    mv $HOSTS_FILE_NEW $HOSTS_FILE
  fi
}

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

SEDCMD="sed"
if [[ "$OS" == "MACOS" ]]; then
  SEDCMD="bin/gsed"
fi

export REMOTE_ADDR=$(grep "Remote_Addr" config.json | $SEDCMD -r 's/^.*?:\s?"([^"]*)".*/\1/')
if [[ "$REMOTE_ADDR" == "" ]]; then
  echo "No remote address specified in config file. Exiting."
  exit 1
fi
export REMOTE_IP=$(ping -c 1 -W 1 $REMOTE_ADDR | tr "\n" "\f" | $SEDCMD -r "s/^.*?$REMOTE_ADDR \(([^)]*)\).*/\1/")
if [[ "$REMOTE_IP" == "" ]]; then
  echo "Remote address \"$REMOTE_ADDR\" has no resolvable ip. Please check the address or your network connection."
  exit 1
fi
echo "REMOTE_ADDR: $REMOTE_ADDR"
echo "REMOTE_IP: $REMOTE_IP"

# Run the damn thing
if [[ "$OS" == "LINUX" ]]; then
  echo "Adding static routes"
  iptables -t nat -I OUTPUT -p tcp -o lo --dport  80 -j REDIRECT --to-ports 4242
  iptables -t nat -I OUTPUT -p tcp -o lo --dport 443 -j REDIRECT --to-ports 4243
  TOGGLE_DNS_PATCH
  echo "Running YAMM"
  LOG_LEVEL=debug bin/node-linux src/app.js
  TOGGLE_DNS_PATCH
  echo "Cleaning up static routes"
  iptables -t nat -D OUTPUT -p tcp -o lo --dport  80 -j REDIRECT --to-ports 4242
  iptables -t nat -D OUTPUT -p tcp -o lo --dport 443 -j REDIRECT --to-ports 4243
fi
if [[ "$OS" == "MACOS" ]]; then
  export PLAIN_PORT=80
  export TLS_PORT=443
  TOGGLE_DNS_PATCH
  echo "Running YAMM"
  LOG_LEVEL=debug bin/node-mac src/app.js
  TOGGLE_DNS_PATCH
fi

