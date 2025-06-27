import React, { useRef, useEffect, useState } from "react";
import { fabric } from "fabric";

export default function VirtualTryOn() {
  const canvasRef = useRef(null);
  const [userImg, setUserImg] = useState(null);
  const [clothingImg, setClothingImg] = useState(null);

  useEffect(() => {
    const canvas = new fabric.Canvas("tryon-canvas", {
      width: 400,
      height: 600,
    });

    canvasRef.current = canvas;

    return () => {
      canvas.dispose();
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (userImg) {
      fabric.Image.fromURL(userImg, (img) => {
        img.scaleToWidth(400);
        canvas.clear();
        canvas.add(img);
        canvas.sendToBack(img);
      });
    }
  }, [userImg]);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (clothingImg) {
      fabric.Image.fromURL(clothingImg, (img) => {
        img.scaleToWidth(300);
        img.top = 150;
        img.left = 50;
        img.hasControls = true;
        img.hasBorders = true;
        canvas.add(img);
      });
    }
  }, [clothingImg]);

  return (
    <div style={{ padding: "2rem" }}>
      <h2>🧥 Virtual Try-On MVP</h2>

      <div style={{ marginBottom: "1rem" }}>
        <label>Upload Your Photo: </label>
        <input
          type="file"
          accept="image/*"
          onChange={(e) =>
            setUserImg(URL.createObjectURL(e.target.files[0]))
          }
        />
      </div>

      <div style={{ marginBottom: "1rem" }}>
        <label>Upload Clothing Image (PNG): </label>
        <input
          type="file"
          accept="image/*"
          onChange={(e) =>
            setClothingImg(URL.createObjectURL(e.target.files[0]))
          }
        />
      </div>

      <canvas id="tryon-canvas" style={{ border: "1px solid #ccc" }} />
    </div>
  );
}
