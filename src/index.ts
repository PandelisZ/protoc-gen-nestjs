import { createEcmaScriptPlugin } from "@bufbuild/protoplugin";
import { version } from "../package.json";
import { GeneratedFile, ImportSymbol, safeIdentifier } from "@bufbuild/protoplugin";
import { DescMethod, DescService } from "@bufbuild/protobuf";
import type { Schema } from "@bufbuild/protoplugin";

export const protocGenNestjs = createEcmaScriptPlugin({
  name: "protoc-gen-nestjs",
  version: `v${String(version)}`,
  generateTs,
});

function generateTs(schema: Schema) {
  for (const file of schema.files) {
    const f = schema.generateFile(file.name + "_nestjs.ts");
    f.preamble(file);
    // Convert the Message ImportSymbol to a type-only ImportSymbol
    for (const service of file.services) {
      printService(f, service);

      printClient(f, service, file.proto.package);
    }
  }
}

function printService(f: GeneratedFile, service: DescService) {
  f.print(f.jsDoc(service));
  f.print`export interface ${safeIdentifier(service.name)}Service {`;
  service.methods.forEach((method, i) => {
    if (i !== 0) {
      f.print();
    }
    printMethod(f, method);
  });
  f.print("}");

  const GrpcMethod = f.import("GrpcMethod", "@nestjs/microservices");
  const GrpcStreamMethod = f.import("GrpcStreamMethod", "@nestjs/microservices");
  const unaryReqMethods = service.methods.filter((method) => {
    const unaryMethodTypes: Array<typeof method.methodKind> = [
      'server_streaming',
      'unary'
    ]
    return unaryMethodTypes.includes(method.methodKind)
  });
  const streamReqMethods = service.methods.filter((method) => {
    const streamReq: Array<typeof method.methodKind> = [
      'bidi_streaming',
      'client_streaming',
    ]
    return streamReq.includes(method.methodKind)
  }
  );

  f.print();
  f.print`${f.export("function", service.name + "Methods")}() {`;
  f.print("  return function (constructor: Function) {");
  printGrpcMethodAnnotations(f, GrpcMethod, unaryReqMethods, service);
  printGrpcMethodAnnotations(f, GrpcStreamMethod, streamReqMethods, service);
  f.print("  };");
  f.print("}");
}

function printMethod(f: GeneratedFile, method: DescMethod) {
  const Observable = f.import("Observable", "rxjs");
  const inputType = f.importShape(method.input);
  const outputType = f.importShape(method.output);

  const isStreamReq = ['bidi_streaming', 'client_streaming'].includes(method.methodKind);
  const isStreamRes = method.methodKind !== 'unary';


  const reqType = isStreamReq ? [Observable, "<", inputType, ">"] : [inputType];
  const resType = isStreamRes ? [Observable, "<", outputType, ">"] : ["Promise<", outputType, ">"];

  f.print(f.jsDoc(method, "  "));
  f.print`  ${method.localName}(request: ${reqType}): ${resType};`;
}

function printGrpcMethodAnnotations(
  f: GeneratedFile,
  annotation: ImportSymbol,
  methods: DescMethod[],
  service: DescService
) {
  const methodNames = methods.map((method) => `"${method.localName}"`).join(", ");

  f.print`    for (const method of [${methodNames}]) {`;
  f.print`      const descriptor: any = Reflect.getOwnPropertyDescriptor(constructor.prototype, method);`;
  f.print`      ${annotation}("${safeIdentifier(service.name)}", method)(constructor.prototype[method], method, descriptor);`;
  f.print`    }`;
}

function printClientMethod(f: GeneratedFile, method: DescMethod) {
  const Observable = f.import("Observable", "rxjs");
  const firstValueFrom = f.import("firstValueFrom", "rxjs");
  const inputType = f.importShape(method.input);
  const outputType = f.importShape(method.output);

  const isStreamReq = ['bidi_streaming', 'client_streaming'].includes(method.methodKind);
  const isStreamRes = method.methodKind !== 'unary';


  const reqType = isStreamReq ? [Observable, "<", inputType, ">"] : [inputType];
  const resType = isStreamRes ? [Observable, "<", outputType, ">"] : ["Promise<", outputType, ">"];

  f.print(f.jsDoc(method, "  "));
  f.print`  ${method.localName}(request: ${reqType}): ${resType} {`;

  if (isStreamRes) {
    f.print("    return this.client.", method.localName, "(request);");
  } else {
    f.print("    return ", firstValueFrom, "(this.client.", method.localName, "(request));");
  }

  f.print("  }")


}

function printClient(f: GeneratedFile, service: DescService, packageName: string) {

  const OnModuleInit = f.import("OnModuleInit", "@nestjs/common");
  const Controller = safeIdentifier(service.name) + "Service";
  const Injectable = f.import("Injectable", "@nestjs/common");
  const Inject = f.import("Inject", "@nestjs/common");
  const ClientGrpc = f.import("ClientGrpc", "@nestjs/microservices");

  f.print()

  f.print("export const INJECTED_", safeIdentifier(service.name).toUpperCase(), "_PACKAGE = '", safeIdentifier(packageName), "';");

  f.print()

  f.print(f.jsDoc(service));
  f.print("@", Injectable, "()");
  f.print("export class ", safeIdentifier(service.name), "Client implements ", OnModuleInit, ", ", Controller, " {");
  f.print()

  f.print("private client: any; //I Know, it's because of nestjs/microservice insisting one verything being observables");
  f.print()

  f.print("constructor(@", Inject, "(INJECTED_", safeIdentifier(service.name).toUpperCase(), "_PACKAGE) ", "private grpc: ", ClientGrpc, ") {}");
  f.print();
  f.print("onModuleInit() { this.client = this.grpc.getService<", Controller, ">(INJECTED_", safeIdentifier(service.name).toUpperCase(), "_PACKAGE) }");


  f.print()
  service.methods.forEach((method, i) => {
    if (i !== 0) {
      f.print();
    }
    printClientMethod(f, method);
  });
  f.print("}");


}
