# CreepJS

[https://abrahamjuliot.github.io/creepjs](https://abrahamjuliot.github.io/creepjs)

The purpose of this project is to shed light on weaknesses and privacy leaks among modern anti-fingerprinting extensions and browsers.

1. Detect and ignore API tampering (API lies)
2. Fingerprint lie types
3. Fingerprint extension code
4. Fingerprint browser privacy settings
5. Employ large-scale validation, but allow possible inconsistencies
6. Feature detect and fingerprint [new APIs](https://www.javascripture.com/) that reveal high entropy
7. Rely only on APIs that are the most difficult to spoof when generating a pure fingerprint

Tested:
- Tor Browser (SL 1 & 2)
- Firefox (RFP)
- ungoogled-chromium (fingerprint deception)
- Brave Browser (Standard/Strict)
- uBlock Origin (aopr)
- Privacy Badger
- Privacy Possom
- Random User-Agent
- User Agent Switcher and Manager
- CanvasBlocker
- Trace
- CyDec
- Chameleon
- ScriptSafe
- Windscribe

## Rules
### Data
- data collected: user agent string, encrypted fingerprints and booleans
- data retention: auto deletes 30 days after last visit
- visit tracking: limited to data retention and new feature scaling

### Signatures
- you may optionally sign your fingerprint with 4-64 characters
- signatures can be memorable descriptors 
- in low entropy browsers, a signature can signal to others that the fingerprint is shared

### New feature scaling
- scaling should occur no more than once per week
- new weekly features may render fingerprints anew
- view deploy [history](https://github.com/abrahamjuliot/creepjs/commits/master/docs/creep.js)

## Formulas
### Trust Score
A failing trust score is unique and can be used to connect fingerprints.

- start at `100%`
- less than 2 loose fingerprints: subtract `0`
- less than 11 loose fingerprints: subtract `total*0.1`
- *11+ loose fingerprints: subtract `total*0.2`
- trash: subtract `total*15.5`
- lies: subtract `total*31`
- errors: subtract `total*5.2`

### Bot Detection
Bots leak unusual behavior and can be denied service.
- 10 loose fingerprints within 48 hours

## Version Detection
- a guess attempt is made to decrypt the browser vendor, version, renderer, engine, and platform
- this guess does not affect the fingerprint
- system is collected from `WorkerNavigator.userAgent` and auto matched to fingerprint ids
- decoded samples are auto computed and manually reviewed if new
- if the worker scope is blocked and the fingerprint ids exist in the database, the version can still be detected

### Tests
1. js Math implementation
2. js engine via console errors
3. HTMLElement version
4. system styles
5. CSS style version
6. contentWindow version

#### Supported
- layout rendering engines: Gecko, Goanna, Blink, WebKit
- JS runtime engines: SpiderMonkey, JavaScriptCore, V8

## Definitions
### Trash
- unusual results
- forgivable lies

### Lies
- prototype tampering
- failed math calculations

### Errors 
- invalid results
- blocked features

### Loose Fingerprint
- collects as much entropy as possible

### Fingerprint
- adapts to browsers and distrusts known noise vectors
- aims to ignore entropy unique to a browser version release
- gathers compressed and static entropy