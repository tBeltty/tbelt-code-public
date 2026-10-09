---
description: "Package map for the terminal client: pure views, the in-process Remote API transport and the runtime behind `dsh terminal`."
kind: "package-group"
---

# terminal-client/ — the terminal client

## Summary

The `terminal-client/` group holds the second client of the Remote API: a Node process that renders a Session in a terminal instead of a browser. It consumes the same Remote API and the same `presentation/` presenters as the GUI, so tool rows, approvals and results mean the same on both surfaces. The transport note records why the client runs in the Host process over an in-process carrier.

## Table of Contents

- [Packages](#packages)
- [Related documentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Packages

| Package | Role |
|---|---|
| [`views/`](views/README.md) | Pure terminal views: transcript lines, composer, key decoding and approval prompt |
| [`runtime/`](runtime/README.md) | The Host plugin behind `dsh terminal`: in-process Remote API client and the terminal loop |

-----

<a id="related-documentation"></a>
## Related documentation

- Surface parity manifest
- [Presentation group](../presentation/README.md)

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
