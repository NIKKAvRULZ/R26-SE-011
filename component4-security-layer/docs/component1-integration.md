# Component 1 integration contract

Component 1 is the only source of academic-record truth. Component 4 must not
scan datasets, choose the latest root, or infer an anchor from local data.

## Required lookup endpoint

```http
GET {ACADEMIC_DATA_BASE_URL}/record/{candidateId}/{moduleCode}?version={optionalVersion}
```

The response must be:

```json
{
  "success": true,
  "record": {
    "candidateId": "TEST001",
    "moduleCode": "SE3040",
    "version": 1,
    "merkleRoot": "0x...",
    "ipfsCID": "bafy..."
  }
}
```

Component 1 owns the MongoDB index for this mapping:

```text
candidateId + moduleCode + version -> merkleRoot + ipfsCID
```

After lookup, Component 4 calls the existing Component 1 endpoints using the
returned root: `GET /{root}`, `GET /{root}/data`, and
`POST /merkle-proof`. Component 4 rejects the request when the root or CID
returned by those endpoints differs from the lookup result.

## Historical full-transcript endpoint

```http
GET {ACADEMIC_DATA_BASE_URL}/records/{candidateId}
```

The response must contain every retained candidate/module proof context:

```json
{
  "success": true,
  "candidateId": "IT22061348",
  "records": [
    {
      "moduleCode": "SE4010",
      "version": 1,
      "merkleRoot": "0x...",
      "ipfsCID": "Qm...",
      "anchoredAt": "2026-08-26T07:50:03.430Z"
    }
  ]
}
```

This endpoint exposes proof locators only, never marks or grades. Component 4
does not trust the index as evidence: it validates every returned root/CID
against Component 1's blockchain proof endpoint, retrieves each finalized
IPFS manifest, recalculates its five-field record hash, and reconstructs its
Merkle membership. Duplicate contexts are ignored. Component 1 must retain
historical proof-index entries; clearing the index breaks candidate-to-anchor
discovery even though the underlying blockchain anchors remain immutable.

Until this endpoint is available, Component 4 falls back to verifying the
candidate records present in `/latest`. That compatibility path cannot verify
a transcript spread across multiple historical batches.

## Component 4 MongoDB ownership

Component 4's `MONGODB_URI` database stores verifier operational data only:
accounts/sessions/audit records when migrated, and verification history. It
must never become a second mutable copy of student grades or anchors.
