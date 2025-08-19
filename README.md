# SeedVault

A blockchain-powered platform for decentralized seed banking and agricultural biodiversity preservation, addressing the real-world problem of seed monopolization, genetic erosion, and farmer dependency by enabling secure, transparent seed sharing and tracking — all on-chain.

---

## Overview

SeedVault consists of five main smart contracts that together form a decentralized, transparent, and community-driven ecosystem for seed preservation and exchange:

1. **Seed Registry Contract** – Registers and tracks unique seed varieties with genetic metadata.
2. **Seed Swap Contract** – Facilitates secure, peer-to-peer seed trading among farmers and seed banks.
3. **Provenance Tracking Contract** – Logs the origin and journey of seeds through planting and harvesting cycles.
4. **Community Governance Contract** – Enables stakeholders to vote on seed preservation initiatives and funding.
5. **Oracle Integration Contract** – Connects with off-chain data for environmental and genetic verification.

---

## Features

- **Seed variety registry** with immutable genetic and origin metadata  
- **Decentralized seed swapping** to promote biodiversity and farmer independence  
- **Provenance tracking** to ensure seed authenticity and prevent fraud  
- **Community-driven governance** for funding conservation efforts and approving new varieties  
- **Environmental data integration** to verify optimal seed storage and planting conditions  
- **Incentive system** for farmers preserving rare or heirloom seeds  
- **Public transparency** via blockchain records accessible to researchers and consumers  
- **Crisis response** by enabling rapid seed distribution during agricultural disruptions  

---

## Smart Contracts

### Seed Registry Contract
- Register seed varieties with unique identifiers and metadata (e.g., genetic markers, origin)
- Update seed data (e.g., new traits observed)
- Queryable public registry for researchers and farmers

### Seed Swap Contract
- Facilitate trustless seed exchanges between parties
- Escrow mechanism to ensure both parties fulfill trade
- Record swap history for transparency

### Provenance Tracking Contract
- Log seed journey (e.g., planting, harvesting, storage)
- Transfer seed custody between farmers, banks, or cooperatives
- Tamper-proof audit trail for authenticity

### Community Governance Contract
- Token-weighted voting for seed preservation proposals
- Fund allocation for conservation or research grants
- Quorum and proposal execution logic

### Oracle Integration Contract
- Fetch off-chain data (e.g., soil conditions, genetic testing results)
- Trigger updates to seed registry or provenance logs
- Emit events for real-time monitoring

---

## Installation

1. Install [Clarinet CLI](https://docs.hiro.so/clarinet/getting-started)
2. Clone this repository:
   ```bash
   git clone https://github.com/yourusername/seedvault.git
   ```
3. Run tests:
    ```bash
    npm test
    ```
4. Deploy contracts:
    ```bash
    clarinet deploy
    ```

## Usage

Each smart contract operates independently but integrates with others for a complete seed preservation and exchange experience.
Refer to individual contract documentation for function calls, parameters, and usage examples.

## License

MIT License

