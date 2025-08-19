;; SeedVault Seed Swap Contract
;; Clarity version: 2.1+
;; Facilitates trustless peer-to-peer swaps of seed NFTs with escrow.
;; Supports direct swaps, open offers, admin controls, pausing, expiration, cancellation, and history logging.
;; Assumes Seed NFTs follow a standard NFT trait (SIP-009 inspired).

;; Define NFT trait for interoperability (SIP-009 inspired)
(define-trait seed-nft-trait
  (
    (transfer (uint principal principal) (response bool uint))
    (get-owner (uint) (response (optional principal) uint))
    (get-last-token-id () (response uint uint))
    (get-token-uri (uint) (response (optional (string-ascii 256)) uint))
  )
)

;; Error codes
(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INSUFFICIENT-OWNERSHIP u101)
(define-constant ERR-SWAP-NOT-FOUND u102)
(define-constant ERR-SWAP-EXPIRED u103)
(define-constant ERR-SWAP-ALREADY-COMPLETED u104)
(define-constant ERR-SWAP-CANCELLED u105)
(define-constant ERR-PAUSED u106)
(define-constant ERR-INVALID-NFT-CONTRACT u107)
(define-constant ERR-INVALID-COUNTERPARTY u108)
(define-constant ERR-INVALID-DEADLINE u109)
(define-constant ERR-ZERO-ADDRESS u110)
(define-constant ERR-ALREADY-ACCEPTED u111)
(define-constant ERR-NOT-COUNTERPARTY u112)
(define-constant ERR-TRANSFER-FAILED u113)

;; Constants
(define-constant CONTRACT-OWNER tx-sender)
(define-constant MIN-DEADLINE-BLOCKS u10) ;; Minimum blocks for deadline

;; Data variables
(define-data-var admin principal tx-sender)
(define-data-var paused bool false)
(define-data-var treasury principal tx-sender)
(define-data-var swap-counter uint u0)

;; Maps
(define-map swaps uint
  {
    offerer: principal,
    offered-nft-contract: principal,
    offered-nft-id: uint,
    requested-nft-contract: principal,
    requested-nft-id: uint,
    counterparty: (optional principal),
    deadline: uint,
    accepted: bool,
    cancelled: bool,
    completed: bool
  }
)

(define-map user-swap-history principal (list 100 uint))

;; Private: Check if caller is admin
(define-private (is-admin)
  (is-eq tx-sender (var-get admin))
)

;; Private: Ensure contract not paused
(define-private (ensure-not-paused)
  (asserts! (not (var-get paused)) (err ERR-PAUSED))
)

;; Private: Transfer NFT using trait
(define-private (transfer-nft (nft-contract <seed-nft-trait>) (token-id uint) (sender principal) (recipient principal))
  (contract-call? nft-contract transfer token-id sender recipient)
)

;; Private: Get NFT owner using trait
(define-private (get-nft-owner (nft-contract <seed-nft-trait>) (token-id uint))
  (contract-call? nft-contract get-owner token-id)
)

;; Public: Transfer admin rights
(define-public (transfer-admin (new-admin principal))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (asserts! (not (is-eq new-admin 'SP000000000000000000002Q6VF78)) (err ERR-ZERO-ADDRESS))
    (var-set admin new-admin)
    (ok true)
  )
)

;; Public: Set paused state
(define-public (set-paused (pause bool))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (var-set paused pause)
    (ok pause)
  )
)

;; Public: Set treasury address
(define-public (set-treasury (new-treasury principal))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (asserts! (not (is-eq new-treasury 'SP000000000000000000002Q6VF78)) (err ERR-ZERO-ADDRESS))
    (var-set treasury new-treasury)
    (ok true)
  )
)

;; Public: Create a swap offer
(define-public (create-swap-offer 
  (offered-nft-contract <seed-nft-trait>) 
  (offered-nft-id uint) 
  (requested-nft-contract <seed-nft-trait>) 
  (requested-nft-id uint) 
  (counterparty (optional principal)) 
  (deadline uint))
  (begin
    (ensure-not-paused)
    (asserts! (> deadline (+ block-height MIN-DEADLINE-BLOCKS)) (err ERR-INVALID-DEADLINE))
    (if (is-some counterparty)
      (asserts! (not (is-eq (unwrap-panic counterparty) 'SP000000000000000000002Q6VF78)) (err ERR-INVALID-COUNTERPARTY))
      true
    )
    ;; Verify offerer owns the offered NFT
    (let ((owner (unwrap! (get-nft-owner offered-nft-contract offered-nft-id) (err ERR-INVALID-NFT-CONTRACT))))
      (asserts! (is-eq owner tx-sender) (err ERR-INSUFFICIENT-OWNERSHIP))
    )
    ;; Transfer offered NFT to this contract (escrow)
    (try! (transfer-nft offered-nft-contract offered-nft-id tx-sender (as-contract tx-sender)))
    ;; Create swap entry
    (let ((swap-id (var-get swap-counter)))
      (map-set swaps swap-id
        {
          offerer: tx-sender,
          offered-nft-contract: (contract-of offered-nft-contract),
          offered-nft-id: offered-nft-id,
          requested-nft-contract: (contract-of requested-nft-contract),
          requested-nft-id: requested-nft-id,
          counterparty: counterparty,
          deadline: deadline,
          accepted: false,
          cancelled: false,
          completed: false
        }
      )
      (var-set swap-counter (+ swap-id u1))
      ;; Update user history
      (map-set user-swap-history tx-sender
        (unwrap! (as-some (append (default-to (list) (map-get? user-swap-history tx-sender)) swap-id)) (err u999)))
      (print { event: "swap-created", id: swap-id, offerer: tx-sender })
      (ok swap-id)
    )
  )
)

;; Public: Accept a swap offer
(define-public (accept-swap (swap-id uint) (requested-nft-contract <seed-nft-trait>))
  (begin
    (ensure-not-paused)
    (let ((swap (unwrap! (map-get? swaps swap-id) (err ERR-SWAP-NOT-FOUND))))
      (asserts! (not (get accepted swap)) (err ERR-ALREADY-ACCEPTED))
      (asserts! (not (get cancelled swap)) (err ERR-SWAP-CANCELLED))
      (asserts! (not (get completed swap)) (err ERR-SWAP-ALREADY-COMPLETED))
      (asserts! (< block-height (get deadline swap)) (err ERR-SWAP-EXPIRED))
      ;; Check if open or specific counterparty
      (match (get counterparty swap)
        some-counterparty (asserts! (is-eq tx-sender some-counterparty) (err ERR-NOT-COUNTERPARTY))
        true
      )
      ;; Verify acceptor owns the requested NFT
      (asserts! (is-eq (contract-of requested-nft-contract) (get requested-nft-contract swap)) (err ERR-INVALID-NFT-CONTRACT))
      (let ((owner (unwrap! (get-nft-owner requested-nft-contract (get requested-nft-id swap)) (err ERR-INVALID-NFT-CONTRACT))))
        (asserts! (is-eq owner tx-sender) (err ERR-INSUFFICIENT-OWNERSHIP))
      )
      ;; Transfer requested NFT to contract (escrow)
      (try! (transfer-nft requested-nft-contract (get requested-nft-id swap) tx-sender (as-contract tx-sender)))
      ;; Swap NFTs
      (let 
        (
          (offered-contract (get offered-nft-contract swap))
          (offered-id (get offered-nft-id swap))
          (requested-id (get requested-nft-id swap))
          (offerer (get offerer swap))
        )
        (as-contract (try! (contract-call? offered-contract transfer offered-id tx-sender tx-sender)))
        (as-contract (try! (contract-call? requested-nft-contract transfer requested-id tx-sender offerer)))
      )
      ;; Update swap
      (map-set swaps swap-id (merge swap { accepted: true, completed: true }))
      (map-set user-swap-history tx-sender
        (unwrap! (as-some (append (default-to (list) (map-get? user-swap-history tx-sender)) swap-id)) (err u999)))
      (print { event: "swap-accepted", id: swap-id, acceptor: tx-sender })
      (ok true)
    )
  )
)

;; Public: Cancel a swap
(define-public (cancel-swap (swap-id uint) (offered-nft-contract <seed-nft-trait>))
  (begin
    (ensure-not-paused)
    (let ((swap (unwrap! (map-get? swaps swap-id) (err ERR-SWAP-NOT-FOUND))))
      (asserts! (is-eq (get offerer swap) tx-sender) (err ERR-NOT-AUTHORIZED))
      (asserts! (not (get accepted swap)) (err ERR-ALREADY-ACCEPTED))
      (asserts! (not (get completed swap)) (err ERR-SWAP-ALREADY-COMPLETED))
      (asserts! (not (get cancelled swap)) (err ERR-SWAP-CANCELLED))
      (asserts! (is-eq (contract-of offered-nft-contract) (get offered-nft-contract swap)) (err ERR-INVALID-NFT-CONTRACT))
      (as-contract (try! (transfer-nft offered-nft-contract (get offered-nft-id swap) tx-sender (get offerer swap))))
      (map-set swaps swap-id (merge swap { cancelled: true }))
      (print { event: "swap-cancelled", id: swap-id, offerer: tx-sender })
      (ok true)
    )
  )
)

;; Read-only: Get swap details
(define-read-only (get-swap (swap-id uint))
  (map-get? swaps swap-id)
)

;; Read-only: Get user swap history
(define-read-only (get-user-history (user principal))
  (default-to (list) (map-get? user-swap-history user))
)

;; Read-only: Get admin
(define-read-only (get-admin)
  (var-get admin)
)

;; Read-only: Is paused
(define-read-only (is-paused)
  (var-get paused)
)

;; Read-only: Get treasury
(define-read-only (get-treasury)
  (var-get treasury)
)

;; Read-only: Get swap counter
(define-read-only (get-swap-counter)
  (var-get swap-counter)
)

;; Line count: Approximately 150 lines with comments and spacing