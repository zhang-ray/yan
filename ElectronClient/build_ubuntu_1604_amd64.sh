# make sure that you're root

# apt's node is too old
apt remove -y node 

# install node 8
wget https://nodejs.org/dist/v8.11.4/node-v8.11.4-linux-x64.tar.xz
tar -Jxvf node-v8.11.4-linux-x64.tar.xz
rsync -aP  node-v8.11.4-linux-x64/ ~/.local/

# install yarn
curl -sS https://dl.yarnpkg.com/debian/pubkey.gpg | sudo apt-key add -
echo "deb https://dl.yarnpkg.com/debian/ stable main" | sudo tee /etc/apt/sources.list.d/yarn.list
apt update || true
apt install -y yarn

# build it
cd Tools
npm install
cd ../ElectronClient/app
npm install && yarn dist
cd ../../


# make package
7z a app.7z ./ElectronClient/app
