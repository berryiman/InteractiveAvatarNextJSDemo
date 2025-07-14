import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      sessionId, 
      conversationData = [],
      duration,
      endReason = "user_ended",
      n8nWebhookUrl 
    } = body;

    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: 'sessionId is required' },
        { status: 400 }
      );
    }

    // Default n8n webhook URL for conversation results
    const webhookUrl = n8nWebhookUrl || process.env.N8N_CONVERSATION_WEBHOOK_URL;
    
    if (!webhookUrl) {
      return NextResponse.json(
        { success: false, error: 'N8N conversation webhook URL not configured' },
        { status: 400 }
      );
    }

    // Prepare conversation summary for n8n
    const conversationSummary = {
      event: 'interview_ended',
      sessionId,
      timestamp: new Date().toISOString(),
      endReason,
      duration,
      conversation: conversationData,
      statistics: {
        totalMessages: conversationData.length,
        avatarMessages: conversationData.filter((msg: any) => msg.type === 'avatar').length,
        userMessages: conversationData.filter((msg: any) => msg.type === 'user').length,
        durationMinutes: duration ? parseFloat(duration.replace(' minutes', '')) : 0
      },
      candidateInfo: {
        userAgent: request.headers.get('user-agent'),
        ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
        endTime: new Date().toISOString()
      }
    };

    console.log('Sending conversation summary to n8n:', webhookUrl);
    console.log('Conversation data:', JSON.stringify(conversationSummary, null, 2));

    // Send conversation summary to n8n
    const webhookResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'HeyGen-Interview-Bot/1.0'
      },
      body: JSON.stringify(conversationSummary)
    });

    if (!webhookResponse.ok) {
      console.error('Conversation webhook failed:', webhookResponse.status, webhookResponse.statusText);
      return NextResponse.json(
        { 
          success: false, 
          error: 'Failed to send conversation to n8n',
          details: `HTTP ${webhookResponse.status}: ${webhookResponse.statusText}`
        },
        { status: 500 }
      );
    }

    const webhookResult = await webhookResponse.text();
    console.log('Conversation webhook success:', webhookResult);

    return NextResponse.json({
      success: true,
      message: 'Interview conversation sent to n8n successfully',
      sessionId,
      conversationSummary: {
        totalMessages: conversationSummary.statistics.totalMessages,
        duration: duration,
        endTime: conversationSummary.timestamp
      }
    });

  } catch (error) {
    console.error('Error processing interview end:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to process interview end',
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
    message: 'Interview end webhook endpoint is ready',
    endpoints: {
      endInterview: 'POST /api/webhook/interview-ended',
      health: 'GET /api/webhook/interview-ended'
    },
    requiredEnv: [
      'N8N_CONVERSATION_WEBHOOK_URL (optional - can be provided in request body)'
    ]
  });
}
