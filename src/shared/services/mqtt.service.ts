import mqtt from "mqtt";
import { env } from "@/shared/config/env";

export const connectMqttSubscriber = () => {
  const client = mqtt.connect(env.MQTT_BROKER_URL, {
    username: env.MQTT_USERNAME,
    password: env.MQTT_PASSWORD,
    reconnectPeriod: 5000,
  });

  client.on("connect", () => {
    console.log(`[mqtt] connected to ${env.MQTT_BROKER_URL}`);
    client.subscribe(env.MQTT_TOPIC, (err) => {
      if (err) {
        console.error(`[mqtt] failed to subscribe to ${env.MQTT_TOPIC}`, err);
        return;
      }
      console.log(`[mqtt] subscribed to ${env.MQTT_TOPIC}`);
    });
  });

  client.on("message", (topic, payload) => {
    const raw = payload.toString();
    try {
      const reading = JSON.parse(raw);
      console.log(`[mqtt] ${topic}:`, reading);
    } catch {
      console.log(`[mqtt] ${topic}:`, raw);
    }
  });

  client.on("error", (err) => {
    console.error("[mqtt] connection error", err);
  });

  client.on("reconnect", () => {
    console.log("[mqtt] reconnecting...");
  });

  return client;
};
