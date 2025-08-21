rm contracts/rewardVerifier.sol
npx circom circuits/reward.circom -o build/circuits/reward.json && npx snarkjs info -c build/circuits/reward.json

npx snarkjs setup --protocol groth -c build/circuits/reward.json --pk build/circuits/reward_proving_key.json --vk build/circuits/reward_verification_key.json

node node_modules/websnark/tools/buildpkey.js -i build/circuits/reward_proving_key.json -o build/circuits/reward_proving_key.bin
# repalce Verifier with rewardVerifier
npx snarkjs generateverifier -v build/circuits/rewardVerifier.sol --vk build/circuits/reward_verification_key.json
sed "s/Verifier/rewardVerifier/" build/circuits/rewardVerifier.sol > contracts/rewardVerifier.sol
