"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const db_service_1 = require("./db.service");
const geo_service_1 = require("./geo.service");
const auth_controller_1 = require("./auth.controller");
const chatbot_controller_1 = require("./chatbot.controller");
const properties_controller_1 = require("./properties.controller");
const account_controller_1 = require("./account.controller");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        controllers: [properties_controller_1.PropertiesController, account_controller_1.AccountController, auth_controller_1.AuthController, auth_controller_1.MeController, chatbot_controller_1.ChatbotController],
        providers: [db_service_1.DbService, geo_service_1.GeoService]
    })
], AppModule);
