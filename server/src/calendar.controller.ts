import { Controller, Get, Query, Req, Res, HttpException } from "@nestjs/common";
import { DbService } from "./db.service";
import { CalendarService } from "./calendar.service";

const err = (code: number, msg: string) => new HttpException({ error: msg }, code);

@Controller("calendar")
export class CalendarController {
  constructor(private db: DbService, private cal: CalendarService) {}

  // Has the logged-in user connected their Google Calendar?
  @Get("status")
  async status(@Req() req: any) {
    const user = await this.db.userFromRequest(req);
    if (!user) throw err(401, "Login required");
    return { configured: this.cal.configured, connected: await this.cal.isConnected(user.email) };
  }

  // Returns the Google consent URL for the logged-in seller to connect.
  @Get("connect-url")
  async connectUrl(@Req() req: any) {
    const user = await this.db.userFromRequest(req);
    if (!user) throw err(401, "Login required");
    if (!this.cal.configured) throw err(501, "Google Calendar not configured on the server");
    return { url: this.cal.buildConnectUrl(user.email) };
  }

  // OAuth callback → store token → back to the account page.
  @Get("callback")
  async callback(@Query("code") code: string, @Query("state") state: string, @Res() res: any) {
    const ok = code && state ? await this.cal.handleCallback(code, state) : false;
    res.redirect(ok ? "/account?calendar=connected" : "/account?calendar=error");
  }
}
