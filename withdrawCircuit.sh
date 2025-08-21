rm contracts/withdrawVerifier.sol
npx circom circuits/withdraw.circom -o build/circuits/withdraw.json && npx snarkjs info -c build/circuits/withdraw.json
npx snarkjs setup --protocol groth -c build/circuits/withdraw.json --pk build/circuits/withdraw_proving_key.json --vk build/circuits/withdraw_verification_key.json
node node_modules/websnark/tools/buildpkey.js -i build/circuits/withdraw_proving_key.json -o build/circuits/withdraw_proving_key.bin
npx snarkjs generateverifier -v build/circuits/withdrawVerifier.sol --vk build/circuits/withdraw_verification_key.json

sed "s/Verifier/withdrawVerifier/" build/circuits/withdrawVerifier.sol > contracts/withdrawVerifier.sol
