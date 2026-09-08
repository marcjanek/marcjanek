# Marcin Mozolewski

**Senior Cloud Platform Engineer** · [Procter & Gamble](https://us.pg.com/) · Warsaw, Poland

I build the layer other engineers build on: cloud network architecture, egress security, and the provisioning path that new projects are created through. Commercially since 2021, five years self-taught before that.

[contact@mozolewski.eu](mailto:contact@mozolewski.eu?subject=Contact) · [mozolewski.eu](https://mozolewski.eu) · [LinkedIn](https://www.linkedin.com/in/marcin-mozolewski) · [Stack Overflow](https://stackoverflow.com/users/13347227/marcin-mozolewski) · [Credly](https://www.credly.com/users/marcin-mozolewski)

---

### Selected work

**A network foundation shared by two clouds and a data center.** Every team solved connectivity in its own way, and there was no highly available path between Google Cloud, on-premises and a second public cloud. I helped design and build a redundant interconnect with geo-redundant failover, and a pattern that lets spoke networks attach to it without one-off engineering — in production, with disaster recovery in a second region, engineered for 20 Gbps against a four-nines target, and about 25% better than the path the first applications left.
`cloud-interconnect` `cloud-router` `vpc` `terraform`

**Egress policy that runs inside the request, not beside it.** Traffic arriving over Private Service Connect carries nothing that identifies the consumer behind it, so egress policy cannot be enforced per consumer — and no managed service offered it at the time. I built a control plane that resolves each connection's consumer and decides allow or deny in-process inside the proxy, fail-closed, with no network round trip on the decision path; it runs across two regions, and other teams adopt it through a Terraform provider I wrote.
`envoy` `rust-wasm` `go` `postgresql` `kubernetes` `flux`

**One path for every new project.** New projects, their Terraform workspaces and their infrastructure repositories were created ad hoc, with no consistent model to inherit. I designed the automated path they all take now — creation, labeling, perimeter placement, identity federation, multi-environment support — and the API in front of it. Since 2026 it is the only way a new project is created, not one route among several, and hundreds of applications have been provisioned on one uniform model.
`terraform` `terraform-cloud` `google-cloud` `open-policy-agent`

Career and the rest are on [mozolewski.eu](https://mozolewski.eu).

### Stack

- **Workload** · Kubernetes, Docker, Envoy
- **Platform** · Terraform, Terraform Cloud, Open Policy Agent, Flux, GitHub Actions
- **Observability** · Google Managed Prometheus, Cloud Trace
- **Providers** · Google Cloud daily; Azure, AWS, OCI, IBM Cloud, Alibaba Cloud, DigitalOcean and Cloudflare worked with
- **Languages** · Python, Rust, Go, HCL, SQL

Linux and Git at every layer.

### Certifications

<!--BUILD:certs-->
**10 certifications, 8 current.**

| Certification | Issued | Status |
|---|---|---|
| GitHub Actions | 2025-06-30 |  |
| GitHub Advanced Security | 2025-06-29 |  |
| GitHub Administration | 2025-06-24 |  |
| GitHub Copilot | 2025-06-21 |  |
| GitHub Foundations | 2025-06-19 |  |
| HashiCorp Certified: Terraform Associate (003) | 2024-12-29 |  |
| Associate Cloud Engineer Certification | 2024-09-22 |  |
| Microsoft Certified: Azure Developer Associate (AZ-204) | 2021 | expired 2022 |
| Microsoft Certified: Azure Fundamentals (AZ-900) | 2021 |  |
| Oracle Cloud Infrastructure Foundations 2020 Certified Associate | 2020-07-17 | expired 2022-01-17 |

Verify at [credly.com/users/marcin-mozolewski](https://www.credly.com/users/marcin-mozolewski) — everything except the two Microsoft entries, which are held on Microsoft Learn.
<!--/BUILD:certs-->

### Off the clock

Open source, OSINT, and — away from screens — sailing, iceboating and brain teasers.
