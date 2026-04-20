import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { DepartmentsService } from './departments.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import { UserRole } from '../common/enums';

@Controller('departments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DepartmentsController {
  constructor(private readonly departmentsService: DepartmentsService) {}

  @Get()
  async findAll() {
    return this.departmentsService.findAll();
  }

  // Static routes MUST come before :id parameterized routes
  @Get('users/:userId/departments')
  async getUserDepartments(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.departmentsService.getUserDepartments(userId);
  }

  @Get(':id')
  async findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.departmentsService.findById(id);
  }

  @Get(':id/members')
  async getDepartmentMembers(@Param('id', ParseUUIDPipe) id: string) {
    return this.departmentsService.getDepartmentUsers(id);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  async create(@Body() dto: CreateDepartmentDto) {
    return this.departmentsService.create(dto);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDepartmentDto,
  ) {
    return this.departmentsService.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  async delete(@Param('id', ParseUUIDPipe) id: string) {
    return this.departmentsService.delete(id);
  }

  @Patch(':id/assign-user')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async assignUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { userId: string },
  ) {
    return this.departmentsService.assignUser(id, body.userId);
  }

  @Patch(':id/remove-user')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async removeUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { userId: string },
  ) {
    return this.departmentsService.removeUser(id, body.userId);
  }
}
