import {
  BoxGeometry,
  CapsuleGeometry,
  ColorRepresentation,
  ConeGeometry,
  DoubleSide,
  Group,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  PlaneGeometry,
  Sprite,
  SpriteMaterial,
  Vector3
} from "three";
import { getBaseTerrainHeight } from "./Terrain";
import { createCheckerTexture, createGradientTexture, createLabelTexture } from "./Textures";

function makeLambert(color: ColorRepresentation, mapEnabled = false): MeshLambertMaterial {
  return new MeshLambertMaterial({
    color,
    map: mapEnabled ? createCheckerTexture("#8f8f8f", "#747474") : null,
    flatShading: true
  });
}

function makeLabel(text: string): Sprite {
  const sprite = new Sprite(
    new SpriteMaterial({
      map: createLabelTexture(text),
      transparent: true,
      depthWrite: false
    })
  );
  sprite.scale.set(1.6, 0.4, 1);
  sprite.position.set(0, 2.6, 0);
  return sprite;
}

export function createKittyPlaceholder(color: ColorRepresentation): Group {
  // TODO: replace with /public/assets/models/kitty.glb
  const root = new Group();
  root.name = "TODO_SLOT_kitty";

  const body = new Mesh(new CapsuleGeometry(0.33, 0.75, 4, 8), makeLambert(color));
  body.position.y = 0.75;
  root.add(body);

  const earGeo = new ConeGeometry(0.12, 0.25, 3);
  const earL = new Mesh(earGeo, makeLambert("#ffd4df"));
  earL.position.set(-0.15, 1.45, 0);
  earL.rotation.z = 0.15;
  const earR = earL.clone();
  earR.position.x = 0.15;
  earR.rotation.z = -0.15;
  root.add(earL, earR, makeLabel("kitty.glb"));

  return root;
}

export function createNpcGirlPlaceholder(): Group {
  // TODO: replace with /public/assets/models/npc_girl.glb
  const root = new Group();
  root.name = "TODO_SLOT_npc_girl";

  const body = new Mesh(new CapsuleGeometry(0.28, 0.8, 4, 8), makeLambert("#ffa2c7"));
  body.position.y = 0.8;
  const hair = new Mesh(new BoxGeometry(0.55, 0.2, 0.5), makeLambert("#5f2e3c"));
  hair.position.y = 1.35;

  root.add(body, hair, makeLabel("npc_girl.glb"));
  return root;
}

export function createFriendPlaceholder(color: ColorRepresentation, slotName: string): Group {
  // TODO: replace with /public/assets/models/friend_*.glb
  const root = new Group();
  root.name = `TODO_SLOT_${slotName}`;

  const torso = new Mesh(new BoxGeometry(0.6, 0.9, 0.35), makeLambert(color));
  torso.position.y = 1.0;

  const head = new Mesh(new BoxGeometry(0.36, 0.34, 0.34), makeLambert("#f0c4a0"));
  head.position.y = 1.72;
  head.name = "head";

  const armMat = makeLambert("#f0c4a0");
  const leftArm = new Mesh(new BoxGeometry(0.16, 0.6, 0.16), armMat);
  leftArm.position.set(-0.42, 1.02, 0);
  leftArm.name = "leftArm";

  const rightArm = new Mesh(new BoxGeometry(0.16, 0.6, 0.16), armMat);
  rightArm.position.set(0.42, 1.02, 0);
  rightArm.name = "rightArm";

  root.add(torso, head, leftArm, rightArm, makeLabel(slotName));
  return root;
}

export function createHousePlaceholder(variant = 0): Group {
  // TODO: replace with /public/assets/models/house_*.glb
  const root = new Group();
  root.name = `TODO_SLOT_house_${variant}`;

  const walls = new Mesh(
    new BoxGeometry(2.4, 1.9, 2.1),
    new MeshLambertMaterial({
      map: createCheckerTexture(variant % 2 === 0 ? "#b3a8d8" : "#82a2cf", "#6f648e", 64, 8),
      flatShading: true
    })
  );
  walls.position.y = 0.95;

  const roof = new Mesh(new ConeGeometry(1.9, 1.1, 4), makeLambert("#824e5f"));
  roof.position.y = 2.35;
  roof.rotation.y = Math.PI * 0.25;

  root.add(walls, roof);
  return root;
}

export function createLandscapePlaceholder(): Mesh {
  // TODO: replace with /public/assets/models/world_landscape.glb
  const geometry = new PlaneGeometry(120, 120, 42, 42);
  const vertices = geometry.attributes.position;

  for (let i = 0; i < vertices.count; i += 1) {
    const x = vertices.getX(i);
    const z = vertices.getY(i);
    const hillHeight = getBaseTerrainHeight(x, z);
    vertices.setZ(i, hillHeight);
  }

  geometry.computeVertexNormals();

  const ground = new Mesh(
    geometry,
    new MeshLambertMaterial({
      map: createGradientTexture("#ffb8de", "#d573b7", 128),
      flatShading: true
    })
  );
  ground.rotation.x = -Math.PI * 0.5;
  ground.receiveShadow = true;
  ground.name = "TODO_SLOT_world_landscape";
  return ground;
}

export function createClubRoomPlaceholder(): Group {
  // TODO: replace with /public/assets/models/club_room.glb
  const root = new Group();
  root.name = "TODO_SLOT_club_room";

  const floor = new Mesh(
    new PlaneGeometry(20, 16, 1, 1),
    new MeshLambertMaterial({
      map: createCheckerTexture("#303545", "#1f2230", 64, 4),
      flatShading: true
    })
  );
  floor.rotation.x = -Math.PI * 0.5;
  floor.position.y = 0;

  const wallMat = makeLambert("#2b1d34");
  const backWall = new Mesh(new BoxGeometry(20, 7, 0.4), wallMat);
  backWall.position.set(0, 3.5, -8);

  const sideL = new Mesh(new BoxGeometry(0.4, 7, 16), wallMat);
  sideL.position.set(-10, 3.5, 0);

  const sideR = sideL.clone();
  sideR.position.x = 10;

  root.add(floor, backWall, sideL, sideR);
  return root;
}

export function createDJBoothPlaceholder(): Group {
  // TODO: replace with /public/assets/models/dj_booth.glb
  const root = new Group();
  root.name = "TODO_SLOT_dj_booth";

  const booth = new Mesh(new BoxGeometry(3.8, 1.4, 1.2), makeLambert("#2f2f38", true));
  booth.position.y = 0.8;

  const panel = new Mesh(new BoxGeometry(3.1, 0.25, 0.65), makeLambert("#8e96bc"));
  panel.position.set(0, 1.55, -0.1);

  root.add(booth, panel, makeLabel("dj_booth.glb"));
  return root;
}

export function createLightConeMaterial(color: ColorRepresentation): Material {
  return new MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.17,
    depthWrite: false,
    side: DoubleSide
  });
}

export function setObjectY(object: Object3D, y: number): void {
  const pos = object.position.clone();
  pos.y = y;
  object.position.copy(pos);
}

export function getForwardFromAngle(angle: number): Vector3 {
  return new Vector3(Math.sin(angle), 0, Math.cos(angle));
}
