import { connect, type MqttClient } from 'mqtt';

const topic = process.env.MQTT_ORDER_CREATED_TOPIC || 'orders/created';
const encoder = new TextEncoder();
const listeners = new Set<ReadableStreamDefaultController<Uint8Array>>();
let client: MqttClient | undefined;
let mqttStatus: 'connecting' | 'connected' | 'disconnected' = 'connecting';

function sendEvent(name: string, data: unknown) {
  const message = encoder.encode(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
  for (const listener of listeners) {
    try { listener.enqueue(message); }
    catch { listeners.delete(listener); }
  }
}

function updateMqttStatus(status: typeof mqttStatus) {
  mqttStatus = status;
  sendEvent('connection', { state: status });
}

function startMqttListener() {
  if (client) return;

  client = connect(process.env.MQTT_URL || 'mqtt://127.0.0.1:1883', {
    username: process.env.MQTT_USERNAME || undefined,
    password: process.env.MQTT_PASSWORD || undefined,
    clean: true,
    resubscribe: false,
    reconnectPeriod: 2000,
    connectTimeout: 10000,
  });
  client.on('connect', () => {
    updateMqttStatus('connecting');
    client?.subscribe(topic, { qos: 1 }, (error, granted) => {
      if (error || !granted?.some((item) => item.topic === topic && item.qos <= 2)) {
        console.error('MQTT order-event topic subscription failed:', error?.message || 'No topic grant');
        updateMqttStatus('disconnected');
        return;
      }
      updateMqttStatus('connected');
    });
  });
  client.on('reconnect', () => updateMqttStatus('connecting'));
  client.on('offline', () => updateMqttStatus('disconnected'));
  client.on('close', () => updateMqttStatus('disconnected'));
  client.on('message', (receivedTopic, payload, packet) => {
    if (receivedTopic !== topic || packet.retain) return;

    try {
      const event = JSON.parse(payload.toString());
      if (event.event !== 'order.created' || !event.order_id) return;
      sendEvent('order.created', { orderId: event.order_id });
    } catch {
      console.error('Ignoring malformed MQTT order-created event.');
    }
  });
  client.on('error', (error) => {
    console.error('MQTT order-event bridge error:', error.message);
    updateMqttStatus('disconnected');
  });
}

export async function GET(request: Request) {
  if (!/(?:^|;\s*)accrabasket_admin=([^;]+)/.test(request.headers.get('cookie') || '')) {
    return Response.json({ msg: 'Please sign in to view order updates.' }, { status: 401 });
  }

  startMqttListener();
  let keepAlive: ReturnType<typeof setInterval>;
  let closeStream = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      listeners.add(controller);
      controller.enqueue(encoder.encode(': connected\n\n'));
      controller.enqueue(encoder.encode(`event: connection\ndata: ${JSON.stringify({ state: mqttStatus })}\n\n`));
      keepAlive = setInterval(() => {
        try { controller.enqueue(encoder.encode(': keep-alive\n\n')); }
        catch { closeStream(); }
      }, 25000);
      closeStream = () => {
        clearInterval(keepAlive);
        listeners.delete(controller);
        request.signal.removeEventListener('abort', closeStream);
      };
      request.signal.addEventListener('abort', closeStream, { once: true });
    },
    cancel() { closeStream(); },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}