import { Module } from "@nestjs/common";
import { DbService } from "./db.service";
import { GeoService } from "./geo.service";
import { CalendarService } from "./calendar.service";
import { AuthController, MeController } from "./auth.controller";
import { ChatbotController } from "./chatbot.controller";
import { CalendarController } from "./calendar.controller";
import { PropertiesController } from "./properties.controller";
import { AccountController } from "./account.controller";

@Module({
  controllers: [PropertiesController, AccountController, AuthController, MeController, ChatbotController, CalendarController],
  providers: [DbService, GeoService, CalendarService]
})
export class AppModule {}
