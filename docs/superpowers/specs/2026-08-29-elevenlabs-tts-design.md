# ElevenLabs Text-to-Speech Integration

## Goal

Replace the current OpenAI text-to-speech integration with ElevenLabs while keeping the existing voice preview, video-length fitting, and MP4 export behavior.

## User experience

- The Voice-over panel provides an ElevenLabs API key, voice selection, and model selection.
- Users can load their available ElevenLabs voices through the API.
- Users can generate speech from the entered text.
- The existing audio-file upload option remains available.
- Generated audio is previewed in the existing audio player and can still be fitted to the video duration.

## API integration

The browser calls ElevenLabs directly because this is a static app and the user selected browser-direct API access.

- Voice discovery: `GET https://api.elevenlabs.io/v1/voices`
- Speech generation: `POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}`
- Authentication: `xi-api-key` request header
- Output: MP3 audio decoded by the existing Web Audio pipeline
- Default model: `eleven_multilingual_v2`

The API key remains in the input and runtime memory only. It is not persisted to storage or included in generated files.

## Existing pipeline preservation

The implementation will keep `loadAudioBytes()` as the single handoff into the application’s audio pipeline. ElevenLabs’ MP3 response will be passed to that function, preserving:

- Browser audio preview
- Voice duration reporting
- Fit-video-length behavior
- WebCodecs AAC encoding and MP4 muxing
- Manual audio-file import

## Error handling

Generation and voice-loading failures will show the HTTP status and a short response message in the existing status area. Missing API key, text, or voice selection will be rejected before making a request.

## Verification

- Confirm the UI no longer contains OpenAI-specific labels or endpoints.
- Confirm voice loading maps ElevenLabs voice names and IDs into the selector.
- Confirm speech generation accepts an MP3 response and updates the existing player/status.
- Run the existing animation tests and linter.
- Verify the application still loads without JavaScript errors.
