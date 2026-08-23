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

## Component 4 MongoDB ownership

Component 4's `MONGODB_URI` database stores verifier operational data only:
accounts/sessions/audit records when migrated, and verification history. It
must never become a second mutable copy of student grades or anchors.
