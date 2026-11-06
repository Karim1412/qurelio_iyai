import {
  Controller, Post, Get, Patch, Delete, Body, UseGuards, HttpCode, HttpStatus,
  UseInterceptors, UploadedFile, ParseFilePipe, MaxFileSizeValidator, Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthService }   from './auth.service';
import { JwtAuthGuard }  from './jwt-auth.guard';
import { Public, CurrentUser } from './decorators/index';
import { JwtRequestUser } from './jwt.strategy';
import {
  RegisterCompanyDto, RegisterUserDto, LoginDto, VerifyOtpDto, ResendOtpDto,
  ForgotPasswordDto, ResetPasswordDto, UpdateProfileDto, ChangePasswordDto,
  SetupAccountDto, ContactDto, RefreshTokenDto,
} from './auth.dto';

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Public() @Post('register/company')
  registerCompany(@Body() dto: RegisterCompanyDto) { return this.auth.registerCompany(dto); }

  @Public() @Post('register/user')
  registerUser(@Body() dto: RegisterUserDto) { return this.auth.registerUser(dto); }

  @Public() @Post('verify/user')  @HttpCode(HttpStatus.OK)
  verifyUserOtp(@Body() dto: VerifyOtpDto) { return this.auth.verifyUserOtp(dto); }

  @Public() @Post('verify/company') @HttpCode(HttpStatus.OK)
  verifyCompanyOtp(@Body() dto: VerifyOtpDto) { return this.auth.verifyCompanyOtp(dto); }

  @Public() @Post('otp/resend') @HttpCode(HttpStatus.OK)
  resendOtp(@Body() dto: ResendOtpDto) { return this.auth.resendOtp(dto.email); }

  @Public() @Post('login') @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) { return this.auth.login(dto); }

  @Public() @Post('refresh') @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshTokenDto) { return this.auth.refresh(dto); }

  @Post('logout') @UseGuards(JwtAuthGuard) @HttpCode(HttpStatus.OK)
  logout(@CurrentUser() principal: JwtRequestUser) { return this.auth.logout(principal); }

  @Public() @Post('forgot-password') @HttpCode(HttpStatus.OK)
  forgotPassword(@Body() dto: ForgotPasswordDto) { return this.auth.forgotPassword(dto); }

  @Public() @Post('reset-password') @HttpCode(HttpStatus.OK)
  resetPassword(@Body() dto: ResetPasswordDto) { return this.auth.resetPassword(dto); }

  @Public() @Post('setup-account') @HttpCode(HttpStatus.OK)
  setupAccount(@Body() dto: SetupAccountDto) { return this.auth.setupAccount(dto); }

  @Get('me') @UseGuards(JwtAuthGuard)
  getMe(@CurrentUser() principal: JwtRequestUser) { return this.auth.getMe(principal); }

  /** Binary image; requires Authorization (img src cannot send JWT. UI uses fetch + blob URL). */
  @Get('profile/avatar/image') @UseGuards(JwtAuthGuard)
  profileAvatarImage(@CurrentUser() principal: JwtRequestUser, @Res({ passthrough: false }) res: Response) {
    return this.auth.sendProfileAvatarImage(principal, res);
  }

  @Patch('profile') @UseGuards(JwtAuthGuard)
  updateProfile(@CurrentUser() principal: JwtRequestUser, @Body() dto: UpdateProfileDto) {
    return this.auth.updateProfile(principal, dto);
  }

  @Post('profile/avatar') @UseGuards(JwtAuthGuard) @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  uploadProfileAvatar(
    @CurrentUser() principal: JwtRequestUser,
    @UploadedFile(
      new ParseFilePipe({
        fileIsRequired: true,
        validators: [new MaxFileSizeValidator({ maxSize: 2 * 1024 * 1024 })],
      }),
    )
    file: Express.Multer.File,
  ) {
    return this.auth.uploadProfileAvatar(principal, file);
  }

  @Delete('profile/avatar') @UseGuards(JwtAuthGuard) @HttpCode(HttpStatus.OK)
  removeProfileAvatar(@CurrentUser() principal: JwtRequestUser) {
    return this.auth.removeProfileAvatar(principal);
  }

  @Patch('password') @UseGuards(JwtAuthGuard)
  changePassword(@CurrentUser() principal: JwtRequestUser, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(principal, dto);
  }

  @Public() @Post('contact') @HttpCode(HttpStatus.OK)
  contact(@Body() dto: ContactDto) { return this.auth.contact(dto); }
}
