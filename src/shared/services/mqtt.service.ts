import mqtt, { MqttClient } from "mqtt";
import { env } from "@/shared/config/env";

let client: MqttClient | null = null;

export const getMqttClient = (): MqttClient => {
  if (client) return client;

  client = mqtt.connect(env.MQTT_BROKER_URL, {
    username: env.MQTT_USERNAME,
    password: env.MQTT_PASSWORD,
    reconnectPeriod: 5000,
  });

  client.on("connect", () => {
    console.log(`[mqtt] connected to ${env.MQTT_BROKER_URL}`);
  });

  client.on("error", (err) => {
    console.error("[mqtt] connection error", err);
  });

  client.on("reconnect", () => {
    console.log("[mqtt] reconnecting...");
  });

  return client;
};

export const connectMqttSubscriber = () => {
  const mqttClient = getMqttClient();

  mqttClient.on("connect", () => {
    mqttClient.subscribe(env.MQTT_TOPIC, (err) => {
      if (err) {
        console.error(`[mqtt] failed to subscribe to ${env.MQTT_TOPIC}`, err);
        return;
      }
      console.log(`[mqtt] subscribed to ${env.MQTT_TOPIC}`);
    });
  });

  mqttClient.on("message", (topic, payload) => {
    if (topic !== env.MQTT_TOPIC) return;
    const raw = payload.toString();
    try {
      console.log(`[mqtt] ${topic}:`, JSON.parse(raw));
    } catch {
      console.log(`[mqtt] ${topic}:`, raw);
    }
  });

  return mqttClient;
};
