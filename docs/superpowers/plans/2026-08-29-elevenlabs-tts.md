# ElevenLabs Text-to-Speech Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the browser-side OpenAI speech generator with ElevenLabs voice discovery and MP3 speech generation while preserving the existing audio preview and video export pipeline.

**Architecture:** Keep the integration in `index.html`, following the existing single-file vanilla JavaScript architecture. Add small ElevenLabs request helpers that validate inputs, call the voices and text-to-speech endpoints with `xi-api-key`, and pass returned MP3 bytes to the existing `loadAudioBytes()` function. Keep the key runtime-only and do not add a dependency or backend.

**Tech Stack:** Vanilla HTML/CSS/JavaScript, Fetch API, Web Audio API, ElevenLabs REST API.

## Global Constraints

- ElevenLabs requests are made directly from the browser because the app is static and browser-direct key handling was selected.
- The API key is never persisted to local storage, project files, generated audio, or exported video.
- The existing `loadAudioBytes()` function remains the handoff for generated and uploaded audio.
- The existing manual audio-file option, preview player, fit-video-length control, and MP4 audio muxing remain available.
- Do not modify animation behavior, frame timing, or the existing `animation-math.js` tests.

---

### Task 1: Replace the voice-over controls

**Files:**
- Modify: `index.html:461-482` — Voice-over panel markup

**Interfaces:**
- Produces the element IDs `vgKey`, `vgText`, `vgVoice`, `vgModel`, `vgLoadVoices`, and `vgGen` used by Task 2.

- [ ] **Step 1: Replace OpenAI-specific markup**

Replace the current OpenAI voice/model controls:

```html
<div class="vgrow">
  <select id="vgVoice" aria-label="Voice">
    <option value="alloy">Alloy</option>
    <option value="ash">Ash</option>
    <option value="ballad">Ballad</option>
    <option value="coral">Coral</option>
    <option value="echo">Echo</option>
    <option value="fable">Fable</option>
    <option value="nova" selected>Nova</option>
    <option value="onyx">Onyx</option>
    <option value="sage">Sage</option>
    <option value="shimmer">Shimmer</option>
  </select>
  <input type="text" id="vgModel" value="gpt-4o-mini-tts" aria-label="Model">
</div>
<input type="password" id="vgKey" placeholder="OpenAI API key (sk-...)" autocomplete="off">
<button class="go" id="vgGen" style="margin-top:10px">Generate voice</button>
```

with:

```html
<div class="vgrow">
  <select id="vgVoice" aria-label="ElevenLabs voice">
    <option value="21m00Tcm4TlvDq8ikWAM">Rachel</option>
  </select>
  <button class="ghost" id="vgLoadVoices" type="button">Load voices</button>
</div>
<input type="text" id="vgModel" value="eleven_multilingual_v2" aria-label="ElevenLabs model">
<input type="password" id="vgKey" placeholder="ElevenLabs API key" autocomplete="off">
<button class="go" id="vgGen" style="margin-top:10px">Generate voice</button>
```

- [ ] **Step 2: Update the panel copy**

Replace the OpenAI warning with:

```html
<p class="note warn">Your ElevenLabs key is sent directly from this browser for the request and is never stored or saved into this file. Use a project key you can revoke.</p>
```

- [ ] **Step 3: Run a markup smoke check**

Run:

```bash
node tests/animation-math-tests.js
```

Expected: `523 passed, 0 failed`. Open the page and confirm the Voice-over panel contains ElevenLabs labels and no OpenAI voice names.

### Task 2: Add ElevenLabs voice discovery and speech generation

**Files:**
- Modify: `index.html:2647-2725` — Voice-over request logic

**Interfaces:**
- Consumes `vgKey`, `vgVoice`, `vgModel`, and `vgText` from Task 1.
- Produces `loadElevenVoices(key)`, `generateElevenSpeech(key, text, voiceId, modelId)`, and updates `S.audio` only through `loadAudioBytes(bytes, name, mime)`.

- [ ] **Step 1: Add shared ElevenLabs request validation**

Add these helpers before the existing `vgGen` click handler:

```js
  function elevenLabsHeaders(key, json){
    var h={'xi-api-key':key};
    if(json) h['Content-Type']='application/json';
    return h;
  }

  async function elevenLabsResponse(res){
    if(res.ok) return res;
    var text='';
    try{ text=await res.text(); }catch(e){}
    throw new Error('ElevenLabs returned '+res.status+'. '+text.slice(0,180));
  }
```

- [ ] **Step 2: Implement voice discovery**

Add:

```js
  async function loadElevenVoices(key){
    var res=await fetch('https://api.elevenlabs.io/v1/voices',{
      headers:elevenLabsHeaders(key,false)
    });
    res=await elevenLabsResponse(res);
    var data=await res.json();
    return Array.isArray(data.voices)?data.voices:[];
  }
```

Wire `vgLoadVoices` to validate the key, disable itself while loading, replace `vgVoice` options with each voice’s `name` and `voice_id`, and restore the default Rachel option if the response has no voices. Restore the button in a `finally` block. Display success or error through `vgSay()`.

- [ ] **Step 3: Implement speech generation**

Add:

```js
  async function generateElevenSpeech(key,text,voiceId,modelId){
    var res=await fetch(
      'https://api.elevenlabs.io/v1/text-to-speech/'+encodeURIComponent(voiceId)+
      '?output_format=mp3_44100_128',
      {
        method:'POST',
        headers:elevenLabsHeaders(key,true),
        body:JSON.stringify({
          text:text,
          model_id:modelId||'eleven_multilingual_v2'
        })
      }
    );
    res=await elevenLabsResponse(res);
    return res.arrayBuffer();
  }
```

Update the `vgGen` handler to:

1. Read and validate API key, text, voice ID, and model ID.
2. Disable the generate button during the request.
3. Call `generateElevenSpeech()`.
4. Call `loadAudioBytes(bytes, 'elevenlabs-voice.mp3', 'audio/mpeg')`.
5. Show a successful generated-audio status.
6. Show the existing short error status for failures and restore the button in `finally`.

- [ ] **Step 4: Remove OpenAI request remnants**

Delete the old OpenAI fetch URL, `Authorization: Bearer` header, `gpt-4o-mini-tts` fallback, OpenAI voice field, and OpenAI-specific error text. Keep the existing manual audio-file handler untouched.

- [ ] **Step 5: Verify the request wiring without a live key**

Use browser devtools or the page’s runtime to confirm:

- `loadElevenVoices` requests `/v1/voices` with `xi-api-key`.
- `generateElevenSpeech` requests `/v1/text-to-speech/{voice_id}` with the ElevenLabs header and MP3 output format.
- A returned `ArrayBuffer` is passed to `loadAudioBytes()`.
- Missing fields do not issue a network request.

### Task 3: Regression verification and user-facing behavior

**Files:**
- Modify: `index.html` only if verification finds an issue
- Test: `tests/animation-math-tests.js`

**Interfaces:**
- Verifies the Task 1 UI and Task 2 API functions without changing animation interfaces.

- [ ] **Step 1: Run the animation regression suite**

Run:

```bash
node tests/animation-math-tests.js
```

Expected: `523 passed, 0 failed`.

- [ ] **Step 2: Run lint diagnostics**

Run IDE diagnostics for `index.html`.

Expected: no new linter errors.

- [ ] **Step 3: Perform a browser smoke test**

Open `index.html` through HTTP and verify:

- The page loads without console errors.
- ElevenLabs key, voice, model, and Load voices controls are present.
- The manual audio-file option still appears.
- The existing audio player and fit-video-length control remain unchanged.
- The animation preview and frame ruler still render.

- [ ] **Step 4: Perform a live ElevenLabs test when a user key is available**

Enter a revocable ElevenLabs key, load voices, select a returned voice, enter text, and generate speech. Confirm the MP3 previews, duration appears, and the generated audio is included in an export without storing the key.
