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
7z a app.7z ./ElectronClient/app
