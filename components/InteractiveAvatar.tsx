import {
  AvatarQuality,
  StreamingEvents,
  VoiceChatTransport,
  VoiceEmotion,
  StartAvatarRequest,
  STTProvider,
  ElevenLabsModel,
} from "@heygen/streaming-avatar";
import { useEffect, useRef, useState } from "react";
import { useMemoizedFn, useUnmount } from "ahooks";

import { Button } from "./Button";
import { AvatarConfig } from "./AvatarConfig";
import { AvatarVideo } from "./AvatarSession/AvatarVideo";
import { useStreamingAvatarSession } from "./logic/useStreamingAvatarSession";
import { AvatarControls } from "./AvatarSession/AvatarControls";
import { useVoiceChat } from "./logic/useVoiceChat";
import { StreamingAvatarProvider, StreamingAvatarSessionState } from "./logic";
import { LoadingIcon } from "./Icons";
import { MessageHistory } from "./AvatarSession/MessageHistory";

import { AVATARS } from "@/app/lib/constants";

interface N8nWebhookPayload {
  sessionId: string;
  candidateInfo: any;
  avatarConfig: any;
  n8nWebhookUrl: string;
}

const DEFAULT_CONFIG: StartAvatarRequest = {
  quality: AvatarQuality.Low,
  avatarName: AVATARS[0].avatar_id,
  knowledgeId: undefined,
  voice: {
    rate: 1.5,
    emotion: VoiceEmotion.EXCITED,
    model: ElevenLabsModel.eleven_flash_v2_5,
  },
  language: "en",
  voiceChatTransport: VoiceChatTransport.WEBSOCKET,
  sttSettings: {
    provider: STTProvider.DEEPGRAM,
  },
};

function InteractiveAvatar() {
  const { initAvatar, startAvatar, stopAvatar, sessionState, stream } =
    useStreamingAvatarSession();
  const { startVoiceChat } = useVoiceChat();

  const [config, setConfig] = useState<StartAvatarRequest>(DEFAULT_CONFIG);
  const [currentSessionId, setCurrentSessionId] = useState('');
  const [conversationData, setConversationData] = useState<any[]>([]);
  const [interviewStartTime, setInterviewStartTime] = useState<string>('');
  const [isInterviewActive, setIsInterviewActive] = useState(false);

  // DEBUG - untuk cek state
  useEffect(() => {
    console.log('DEBUG - sessionState:', sessionState);
    console.log('DEBUG - isInterviewActive:', isInterviewActive);
  }, [sessionState, isInterviewActive]);

  const mediaStream = useRef<HTMLVideoElement>(null);

  async function fetchAccessToken() {
    try {
      const response = await fetch("/api/get-access-token", {
        method: "POST",
      });
      const token = await response.text();
      console.log("Access Token:", token);
      return token;
    } catch (error) {
      console.error("Error fetching access token:", error);
      throw error;
    }
  }

  // MOVED OUTSIDE - endInterview function
  const endInterview = useMemoizedFn(async () => {
    try {
      if (!currentSessionId) {
        console.error('No active session to end');
        return;
      }

      setIsInterviewActive(false);
      
      // Calculate duration
      const endTime = new Date();
      const startTime = new Date(interviewStartTime);
      const durationMs = endTime.getTime() - startTime.getTime();
      const durationMinutes = Math.round(durationMs / 60000 * 100) / 100;
      const durationText = `${Math.floor(durationMinutes)} minutes ${Math.round((durationMinutes % 1) * 60)} seconds`;

      console.log('Ending interview with conversation data:', conversationData);

      // Send conversation to n8n webhook
      const appBaseUrl = process.env.NEXT_PUBLIC_APP_BASE_URL || '';
      const response = await fetch(`${appBaseUrl}/api/webhook/interview-ended`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sessionId: currentSessionId,
          conversationData: conversationData,
          duration: durationText,
          endReason: 'user_ended',
          statistics: {
            totalMessages: conversationData.length,
            avatarMessages: conversationData.filter(msg => msg.type === 'avatar').length,
            userMessages: conversationData.filter(msg => msg.type === 'user').length,
            durationMinutes: durationMinutes
          }
        })
      });

      const result = await response.json();
      
      if (result.success) {
        console.log('✅ Interview ended successfully, sent to n8n:', result);
        alert(`Interview ended successfully!\nDuration: ${durationText}\nMessages: ${conversationData.length}`);
      } else {
        console.error('❌ Failed to send interview data:', result.error);
        alert(`Interview ended, but failed to send data: ${result.error}`);
      }

      // Stop avatar session
      stopAvatar();
      
      // Reset states
      setConversationData([]);
      setCurrentSessionId('');
      
    } catch (error) {
      console.error('Error ending interview:', error);
      alert(`Error ending interview: ${error}`);
    }
  });

  const triggerN8nWebhook = useMemoizedFn(async (sessionId: string, avatarConfig: any) => {
    const n8nWebhookUrl = process.env.NEXT_PUBLIC_N8N_WEBHOOK_URL;
    
    if (!n8nWebhookUrl) {
      console.log('NEXT_PUBLIC_N8N_WEBHOOK_URL not configured, skipping n8n automation');
      return;
    }

    try {
      console.log('🚀 Triggering n8n automation automatically...');
      
      const webhookPayload: N8nWebhookPayload = {
        sessionId,
        candidateInfo: {
          startTime: new Date().toISOString(),
          browser: navigator.userAgent,
          language: navigator.language,
          platform: navigator.platform
        },
        avatarConfig,
        n8nWebhookUrl
      };

      const appBaseUrl = process.env.NEXT_PUBLIC_APP_BASE_URL || '';
      const response = await fetch(`${appBaseUrl}/api/webhook/interview-started`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(webhookPayload)
      });

      const result = await response.json();
      
      if (result.success) {
        console.log('✅ n8n automation started successfully!', result);
      } else {
        console.error('❌ n8n webhook failed:', result.error);
      }
    } catch (error) {
      console.error('❌ n8n webhook error:', error);
    }
  });
  
  const startSessionV2 = useMemoizedFn(async (isVoiceChat: boolean) => {
    try {
      const newToken = await fetchAccessToken();
      const avatar = initAvatar(newToken);

      // Set interview start time
      setInterviewStartTime(new Date().toISOString());
      setIsInterviewActive(true);
      setConversationData([]);

      // AVATAR EVENTS - Track conversation
      avatar.on(StreamingEvents.AVATAR_START_TALKING, (e) => {
        console.log("Avatar started talking", e);
      });
      
      avatar.on(StreamingEvents.AVATAR_STOP_TALKING, (e) => {
        console.log("Avatar stopped talking", e);
      });

     // ACCUMULATE AVATAR MESSAGE - BARU
let currentAvatarMessage = '';

avatar.on(StreamingEvents.AVATAR_TALKING_MESSAGE, (event) => {
  const newText = event.detail?.message || '';
  currentAvatarMessage += (currentAvatarMessage ? ' ' : '') + newText;
  console.log("Avatar building message:", currentAvatarMessage);
});

// SAVE COMPLETE AVATAR MESSAGE - BARU  
avatar.on(StreamingEvents.AVATAR_END_MESSAGE, (event) => {
  if (currentAvatarMessage.trim()) {
    const message = {
      type: 'avatar',
      text: currentAvatarMessage.trim(),
      timestamp: new Date().toISOString(),
      sender: 'avatar'
    };
    setConversationData(prev => [...prev, message]);
    console.log("✅ Complete avatar message saved:", currentAvatarMessage);
    currentAvatarMessage = ''; // reset
  }
});

      // CAPTURE USER MESSAGES - FIXED
avatar.on(StreamingEvents.USER_TALKING_MESSAGE, (event) => {
  console.log(">>>>> User talking message:", event.detail?.message);
  const message = {
    type: 'user',
    text: event.detail?.message || 'User spoke (message not captured)',
    timestamp: new Date().toISOString(),
    sender: 'user'
  };
  setConversationData(prev => [...prev, message]);
});

      avatar.on(StreamingEvents.AVATAR_END_MESSAGE, (event) => {
        console.log(">>>>> Avatar end message:", event);
        if (event.message) {
          const message = {
            type: 'avatar',
            text: event.message,
            timestamp: new Date().toISOString(),
            sender: 'avatar',
            messageEnd: true
          };
          setConversationData(prev => [...prev, message]);
        }
      });

      avatar.on(StreamingEvents.USER_END_MESSAGE, (event) => {
        console.log(">>>>> User end message:", event);
        if (event.message) {
          const message = {
            type: 'user', 
            text: event.message,
            timestamp: new Date().toISOString(),
            sender: 'user',
            messageEnd: true
          };
          setConversationData(prev => [...prev, message]);
        }
      });

      // Rest of existing avatar setup...
      avatar.on(StreamingEvents.STREAM_DISCONNECTED, () => {
        console.log("Stream disconnected");
        setIsInterviewActive(false);
      });
      
      avatar.on(StreamingEvents.STREAM_READY, (event) => {
        console.log(">>>>> Stream ready:", event.detail);
      });

      await startAvatar(config);

      // Generate session ID and trigger n8n webhook
      const sessionId = `interview_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      setCurrentSessionId(sessionId);

      // Trigger n8n webhook
      await triggerN8nWebhook(sessionId, config);

      if (isVoiceChat) {
        await startVoiceChat();
      }
    } catch (error) {
      console.error("Error starting avatar session:", error);
      setIsInterviewActive(false);
    }
  });

  useUnmount(() => {
    stopAvatar();
  });

  useEffect(() => {
    if (stream && mediaStream.current) {
      mediaStream.current.srcObject = stream;
      mediaStream.current.onloadedmetadata = () => {
        mediaStream.current!.play();
      };
    }
  }, [mediaStream, stream]);

  return (
    <div className="w-full flex flex-col gap-4">
      <div className="flex flex-col rounded-xl bg-zinc-900 overflow-hidden">
        <div className="relative w-full aspect-video overflow-hidden flex flex-col items-center justify-center">
          {sessionState !== StreamingAvatarSessionState.INACTIVE ? (
            <AvatarVideo ref={mediaStream} />
          ) : (
            <AvatarConfig config={config} onConfigChange={setConfig} />
          )}
        </div>
        <div className="flex flex-col gap-3 items-center justify-center p-4 border-t border-zinc-700 w-full">
          {sessionState === StreamingAvatarSessionState.CONNECTED ? (
            <AvatarControls />
          ) : sessionState === StreamingAvatarSessionState.INACTIVE ? (
            <div className="flex flex-row gap-4">
              <Button onClick={() => startSessionV2(true)}>
                Start Voice Chat
              </Button>
              <Button onClick={() => startSessionV2(false)}>
                Start Text Chat
              </Button>
            </div>
          ) : (
            <LoadingIcon />
          )}
        </div>
      </div>
      
      {/* BUTTON TEST - selalu muncul */}
      <div className="mt-4 p-4 border border-green-600 rounded">
        <h3 className="text-green-300 text-sm mb-2">🧪 Test Button (Always Visible)</h3>
        <Button 
          onClick={endInterview}
          className="bg-green-600 hover:bg-green-700 text-white w-full"
        >
          🛑 Test End Interview
        </Button>
        <div className="text-xs text-gray-400 mt-2">
          This button should always be visible for testing
        </div>
      </div>
      
      {sessionState === StreamingAvatarSessionState.CONNECTED && isInterviewActive && (
        <div className="mt-4 p-4 border-t border-zinc-700">
          <h3 className="text-lg font-medium mb-2 text-white">🎙️ Interview Controls</h3>
          <div className="flex flex-col gap-2">
            <div className="text-sm text-gray-300">
              Session: {currentSessionId}
            </div>
            <div className="text-sm text-gray-300">
              Messages captured: {conversationData.length}
            </div>
            <Button 
              onClick={endInterview}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              🛑 End Interview & Send to n8n
            </Button>
          </div>
        </div>
      )}

      {sessionState === StreamingAvatarSessionState.CONNECTED && (
        <MessageHistory />
      )}
    </div>
  );
}

export default function InteractiveAvatarWrapper() {
  return (
    <StreamingAvatarProvider basePath={process.env.NEXT_PUBLIC_BASE_API_URL}>
      <InteractiveAvatar />
    </StreamingAvatarProvider>
  );
}
