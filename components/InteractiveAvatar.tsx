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
// 🚀 TAMBAHKAN DI SINI - n8n Integration types
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
  // 🚀 TAMBAHKAN DI SINI - n8n states
const [n8nWebhookUrl, setN8nWebhookUrl] = useState('');
const [isN8nEnabled, setIsN8nEnabled] = useState(false);
const [webhookStatus, setWebhookStatus] = useState('');
const [currentSessionId, setCurrentSessionId] = useState('');

const mediaStream = useRef<HTMLVideoElement>(null);

  async function fetchAccessToken() {
    try {
      const response = await fetch("/api/get-access-token", {
        method: "POST",
      });
      const token = await response.text();

      console.log("Access Token:", token); // Log the token to verify

      return token;
    } catch (error) {
      console.error("Error fetching access token:", error);
      throw error;
    }
  }

  // 🚀 n8n webhook function
  const triggerN8nWebhook = useMemoizedFn(async (sessionId: string, avatarConfig: any) => {
    if (!isN8nEnabled || !n8nWebhookUrl) {
      console.log('n8n integration disabled or webhook URL not set');
      return;
    }

    try {
      setWebhookStatus('🚀 Triggering n8n automation...');
      
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

      const response = await fetch('/api/webhook/interview-started', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(webhookPayload)
      });

      const result = await response.json();
      
      if (result.success) {
        setWebhookStatus('✅ n8n automation started successfully!');
        console.log('n8n webhook triggered:', result);
      } else {
        setWebhookStatus(`❌ Webhook failed: ${result.error}`);
        console.error('Webhook failed:', result);
      }
    } catch (error) {
      setWebhookStatus(`❌ Webhook error: ${error}`);
      console.error('Error triggering webhook:', error);
    }
  });
  const startSessionV2 = useMemoizedFn(async (isVoiceChat: boolean) => {
    try {
      const newToken = await fetchAccessToken();
      const avatar = initAvatar(newToken);

      avatar.on(StreamingEvents.AVATAR_START_TALKING, (e) => {
        console.log("Avatar started talking", e);
      });
      avatar.on(StreamingEvents.AVATAR_STOP_TALKING, (e) => {
        console.log("Avatar stopped talking", e);
      });
      avatar.on(StreamingEvents.STREAM_DISCONNECTED, () => {
        console.log("Stream disconnected");
      });
      avatar.on(StreamingEvents.STREAM_READY, (event) => {
        console.log(">>>>> Stream ready:", event.detail);
      });
      avatar.on(StreamingEvents.USER_START, (event) => {
        console.log(">>>>> User started talking:", event);
      });
      avatar.on(StreamingEvents.USER_STOP, (event) => {
        console.log(">>>>> User stopped talking:", event);
      });
      avatar.on(StreamingEvents.USER_END_MESSAGE, (event) => {
        console.log(">>>>> User end message:", event);
      });
      avatar.on(StreamingEvents.USER_TALKING_MESSAGE, (event) => {
        console.log(">>>>> User talking message:", event);
      });
      avatar.on(StreamingEvents.AVATAR_TALKING_MESSAGE, (event) => {
        console.log(">>>>> Avatar talking message:", event);
      });
      avatar.on(StreamingEvents.AVATAR_END_MESSAGE, (event) => {
        console.log(">>>>> Avatar end message:", event);
      });

      await startAvatar(config);
      // 🚀 Generate session ID and trigger n8n webhook
const sessionId = `interview_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
setCurrentSessionId(sessionId);

// Trigger n8n webhook
await triggerN8nWebhook(sessionId, config);

      if (isVoiceChat) {
        await startVoiceChat();
      }
    } catch (error) {
      console.error("Error starting avatar session:", error);
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
      {/* n8n Automation Configuration */}
      <div className="mb-4 p-4 border rounded-lg bg-gray-50">
        <h3 className="text-lg font-medium mb-2">🤖 n8n Interview Automation</h3>
        
        <div className="flex items-center mb-2">
          <input
            type="checkbox"
            id="n8n-enabled"
            checked={isN8nEnabled}
            onChange={(e) => setIsN8nEnabled(e.target.checked)}
            className="mr-2"
          />
          <label htmlFor="n8n-enabled">Enable n8n Interview Automation</label>
        </div>
        
        {isN8nEnabled && (
          <div className="space-y-2">
            <input
              type="url"
              placeholder="https://your-n8n-instance.com/webhook/interview-start"
              value={n8nWebhookUrl}
              onChange={(e) => setN8nWebhookUrl(e.target.value)}
              className="w-full p-2 border rounded"
            />
            <p className="text-sm text-gray-600">
              Enter your n8n webhook URL. When interview starts, n8n will automatically take control.
            </p>
            {webhookStatus && (
              <div className="text-sm p-2 rounded bg-blue-50 border border-blue-200">
                {webhookStatus}
              </div>
            )}
          </div>
        )}
      </div>

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
