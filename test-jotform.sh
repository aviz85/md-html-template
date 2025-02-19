#!/bin/bash

# Test audio URL from JotForm
curl -X POST http://localhost:3000/api/jotform-results \
  -H "Content-Type: application/json" \
  -d '{
    "formID": "250422603285450",
    "submissionID": "test-'$(date +%s)'",
    "pretty": "Audio Recording:https://www.jotform.com/uploads/widget-uploads/voiceRecorder/250422603285450/test_audio.wav",
    "q73_input73": "https://www.jotform.com/uploads/widget-uploads/voiceRecorder/250422603285450/test_audio.wav",
    "rawRequest": {
      "q73_input73": "https://www.jotform.com/uploads/widget-uploads/voiceRecorder/250422603285450/test_audio.wav"
    }
  }' 