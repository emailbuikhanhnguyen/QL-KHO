import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import * as fs from 'fs';
import * as path from 'path';

// KHONG dat @UseGuards o day — endpoint nay phai goi duoc TRUOC khi dang
// nhap (trang login can hien logo + version ngay khi vao trang, chua co
// token). Chi tra ve ten + version, khong lo lot thong tin nhay cam.
//
// Doc package.json bang fs.readFileSync (khong dung `import ... .json`)
// de KHONG can bat "resolveJsonModule" trong tsconfig.json — du an nay
// tung gap su co nghiem trong khi sua tsconfig, nen tranh dong vao lai
// tru khi thuc su can thiet.
@ApiTags('He thong - Thong tin ung dung')
@Controller('app-info')
export class AppInfoController {
  @Get()
  getInfo() {
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    return {
      name: 'Kho NPL',
      version: packageJson.version,
    };
  }
}
