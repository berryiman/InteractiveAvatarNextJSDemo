import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      sessionId, 
      candidateInfo = {}, 
      avatarConfig = {},
      n8nWebhookUrl 
    } = body;

    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: 'sessionId is required' },
        { status: 400 }
      );
    }

    // Default n8n webhook URL (bisa diset via environment variable)
    const webhookUrl = n8nWebhookUrl || process.env.N8N_WEBHOOK_URL;
    
    if (!webhookUrl) {
      return NextResponse.json(
        { success: false, error: 'N8N webhook URL not configured' },
        { status: 400 }
      );
    }

    // Payload untuk n8n
    const webhookPayload = {
      event: 'interview_started',
      sessionId,
      timestamp: new Date().toISOString(),
      candidateInfo: {
        userAgent: request.headers.get('user-agent'),
        ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
        referrer: request.headers.get('referer'),
        ...candidateInfo
      },
      avatarConfig,
      apiBaseUrl: `${request.nextUrl.protocol}//${request.nextUrl.host}`,
      endpoints: {
        speak: `/api/session/speak`,
        response: `/api/session/response`,
        end: `/api/session/end`,
        status: `/api/session/start?sessionId=${sessionId}`
      }
    };

    console.log('Triggering n8n webhook:', webhookUrl);
    console.log('Payload:', JSON.stringify(webhookPayload, null, 2));

    // Send webhook to n8n
    const webhookResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'HeyGen-Interview-Bot/1.0'
      },
      body: JSON.stringify(webhookPayload)
    });

    if (!webhookResponse.ok) {
      console.error('Webhook failed:', webhookResponse.status, webhookResponse.statusText);
      return NextResponse.json(
        { 
          success: false, 
          error: 'Failed to trigger n8n webhook',
          details: `HTTP ${webhookResponse.status}: ${webhookResponse.statusText}`
        },
        { status: 500 }
      );
    }

    const webhookResult = await webhookResponse.text();
    console.log('Webhook success:', webhookResult);

    return NextResponse.json({
      success: true,
      message: 'n8n webhook triggered successfully',
      sessionId,
      webhookUrl: webhookUrl.replace(/\/[^\/]*$/, '/***'), // Hide webhook token for security
      webhookResponse: webhookResult
    });

  } catch (error) {
    console.error('Error triggering webhook:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to trigger n8n webhook',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  // Health check endpoint
  return NextResponse.json({
    success: true,
    message: 'Interview webhook endpoint is ready',
    endpoints: {
      trigger: 'POST /api/webhook/interview-started',
      health: 'GET /api/webhook/interview-started'
    },
    requiredEnv: [
      'N8N_WEBHOOK_URL (optional - can be provided in request body)'
    ]
  });
}
