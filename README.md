# YAMM (Yet Another Middle Man)

## How To use:

### Configure the App
Open the file "config.json" and make sure to set these values accordingly to your needs:<br/>
**Remote_Addr**: The address of the remote TS website we will tap into. Usually "**sandbox.tradeshift.com**".<br/>
**Local_Addr**: The address of your local dev environment, where the V4 apps repo project will be running. Usually just "**localhost**".<br/>
**Intercepted_Apps**: A string array with the names of the Apps we wish to intercept. For example "**Configurator**" for the Tradeshift.Configurator, etc.

### Install CA Cerificate
This is a one time action. Just add the certificate file in "**certs/AnyProxyCA.cer**" into the trusted root certificates for your machine (MacOS) or browser.
This step is required for the SSL tapping to work. YAMM will impersonate as the target **Remote_Addr** and this is the formal way of doing it without hacking the browser or server.

### Build the App (this app requires nodejs to build)
Install dependencies: "**npm install**"
Checkout repo.<br/>
Build the app: "**npm run build**"<br/>
The app will be created in the folder "**dist**". You can copy this folder and use the app as standalone (no nodejs required)<br/>
NOTE: A copy of config.json is copied over to the dist folder when the app is built. You may change this file to adjust the config from now on so that you don't have to rebuild.<br/>

### Run the App
Get in the app folder<br/>
Run the app by executing "**./yamm**"<br/>
To close the app press "CTRL-C" as you usually do.<br/>
