# echo info
which node
node --version
which npm
npm --version

# build it
cd ../Tools
npm install
cd ../ElectronClient/app
npm install
yarn dist
cd ../../


# make package
# tar -zcf app.tar.gz ./ElectronClient/app
