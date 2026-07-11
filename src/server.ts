import { app } from "@/app";
import { env } from "@/shared/config/env";
import { connectMqttSubscriber } from "@/shared/services/mqtt.service";

app.listen(env.PORT, () => {
  console.log(`Server listening on port ${env.PORT}`);
});

connectMqttSubscriber();
