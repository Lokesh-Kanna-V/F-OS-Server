import { app } from "@/app";
import { env } from "@/shared/config/env";
import { connectMqttSubscriber } from "@/shared/services/mqtt.service";
import { initAdxl345Mqtt } from "@/features/adxl345";

app.listen(env.PORT, () => {
  console.log(`Server listening on port ${env.PORT}`);
});

connectMqttSubscriber();
initAdxl345Mqtt();
