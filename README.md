# ClinicalTrials.gov API v2 Extractor

A zero-dependency, pure JavaScript client for deterministically extracting 2x2 contingency tables and survival endpoints directly from the ClinicalTrials.gov API v2.

## Why this exists
Most automated systematic review tools rely on LLMs parsing PDFs, which introduces hallucinations and reproducibility errors. This library bypasses the PDF entirely, hitting the legally-mandated structured JSON schemas of the CT.gov registry to extract perfect raw event counts.

## Features
* **Zero Backend:** Runs entirely in the browser.
* **Deterministic:** Exact mathematical extraction of event_count and 
umber_analyzed.
* **Automated Arm Matching:** Fuzz-matches intervention names to treatment/control arms.

## Usage
Used as the core extraction engine for the E156 Ecosystem and RapidMeta.
