import { app } from "@/app";
import { env } from "@/shared/config/env";
import { connectMqttSubscriber } from "@/shared/services/mqtt.service";
import { initAdxl345Mqtt } from "@/features/adxl345";
import { initCtMqtt } from "@/features/ct";

app.listen(env.PORT, () => {
  console.log(`Server listening on port ${env.PORT}`);
});

connectMqttSubscriber();
initAdxl345Mqtt();
initCtMqtt();
