import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const ProofStorageModule = buildModule(
    "ProofStorageModule",
    (m) => {

        const proofStorage =
            m.contract("ProofStorage");

        return {
            proofStorage
        };
    }
);

export default ProofStorageModule;