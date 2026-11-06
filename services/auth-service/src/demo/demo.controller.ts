import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { DemoService } from './demo.service';
import {
  BulkCreateDemoSlotsDto, CreateDemoBookingDto, CreateDemoSlotDto,
  RespondDemoBookingDto, UpdateDemoSlotDto,
} from './demo.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Public, Roles } from '../auth/decorators/index';

/**
 * Public "Book a demo" endpoints: no authentication.
 *
 * Deliberately a separate controller from the admin one: class-level guards
 * cannot then be widened onto these routes by accident.
 *
 * `@Public()` is required: JwtAuthGuard is registered globally as an APP_GUARD,
 * so without it these routes would demand a token. The gateway must also list
 * them in PUBLIC_ROUTES to be reachable unauthenticated.
 */
@Controller('demo')
export class DemoPublicController {
  constructor(private demo: DemoService) {}


  /** Bookable slots, future and unclaimed only. */
  @Public()
  @Get('slots')
  slots() {
    return this.demo.listPublicSlots();
  }

  @Public()
  @Post('bookings')
  @HttpCode(HttpStatus.CREATED)
  book(@Body() dto: CreateDemoBookingDto) {
    return this.demo.createBooking(dto);
  }
}

/**
 * Platform back-office endpoints. Mounted under `/admin` so the gateway's
 * existing `{ prefix: '/admin', roles: ['SUPER_ADMIN'] }` rule already covers
 * them; the guards here are the second line of defence.
 */
@Controller('admin/demo')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN')
export class DemoAdminController {
  constructor(private demo: DemoService) {}


  /** Pending / overdue counts for the dashboard badge. */
  @Get('summary')
  summary() {
    return this.demo.summary();
  }

  @Get('bookings')
  bookings(@Query('status') status?: string) {
    return this.demo.listBookings(status);
  }

  @Patch('bookings/:id')
  respond(@Param('id') id: string, @Body() dto: RespondDemoBookingDto) {
    return this.demo.respondToBooking(id, dto);
  }

  @Delete('bookings/:id')
  @HttpCode(HttpStatus.OK)
  deleteBooking(@Param('id') id: string) {
    return this.demo.deleteBooking(id);
  }

  @Get('slots')
  slots(@Query('from') from?: string, @Query('to') to?: string) {
    return this.demo.listSlots(from, to);
  }

  @Post('slots')
  @HttpCode(HttpStatus.CREATED)
  createSlot(@Body() dto: CreateDemoSlotDto) {
    return this.demo.createSlot(dto);
  }

  @Post('slots/bulk')
  @HttpCode(HttpStatus.CREATED)
  bulkSlots(@Body() dto: BulkCreateDemoSlotsDto) {
    return this.demo.bulkCreateSlots(dto);
  }

  @Patch('slots/:id')
  updateSlot(@Param('id') id: string, @Body() dto: UpdateDemoSlotDto) {
    return this.demo.updateSlot(id, dto);
  }

  @Delete('slots/:id')
  @HttpCode(HttpStatus.OK)
  deleteSlot(@Param('id') id: string) {
    return this.demo.deleteSlot(id);
  }
}
