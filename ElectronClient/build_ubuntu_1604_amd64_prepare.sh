# make sure that you're root

# apt's node is too old
#apt -y remove node nvm
apt -y install curl tree #p7zip-full

# install node 8
#wget https://nodejs.org/dist/v8.11.4/node-v8.11.4-linux-x64.tar.xz
#tar -Jxf node-v8.11.4-linux-x64.tar.xz
#rsync -a node-v8.11.4-linux-x64/ /usr/

# install yarn
curl -sS https://dl.yarnpkg.com/debian/pubkey.gpg | apt-key add -
echo "deb https://dl.yarnpkg.com/debian/ stable main" | tee /etc/apt/sources.list.d/yarn.list
apt update || true
apt -y install yarn
