import { Module } from "@nestjs/common";
import { DbService } from "./db.service";
import { GeoService } from "./geo.service";
import { AuthController, MeController } from "./auth.controller";
import { PropertiesController } from "./properties.controller";
import { AccountController } from "./account.controller";

@Module({
  controllers: [AuthController, MeController, PropertiesController, AccountController],
  providers: [DbService, GeoService]
})
export class AppModule {}
