import { useState, useCallback, useRef } from 'react';
import { RNMLKitFaceDetector } from '@infinitered/react-native-mlkit-face-detection';

/**
 * Face detection configuration options
 */
const DEFAULT_OPTIONS = {
  performanceMode: 'fast', // 'fast' or 'accurate'
  landmarkMode: 'none', // 'none' or 'all'
  classificationMode: 'all', // 'none' or 'all' (smiling, eyes open)
  minFaceSize: 0.15, // Minimum face size ratio (0.0 - 1.0)
  trackingEnabled: false,
};

/**
 * Face validation thresholds
 */
const VALIDATION = {
  MIN_FACE_COUNT: 1,
  MAX_FACE_COUNT: 1,
  MIN_FACE_WIDTH_RATIO: 0.25, // Face should be at least 25% of image width (full face, not half)
  MIN_FACE_HEIGHT_RATIO: 0.25, // Face should be at least 25% of image height
  MAX_TILT_ANGLE: 25, // Maximum head tilt angle in degrees
  MIN_CONFIDENCE: 0.5, // Minimum detection confidence
};

/**
 * Custom hook for ML Kit face detection
 * Provides face detection, validation, and liveness checking
 */
export function useFaceDetection() {
  const [isDetecting, setIsDetecting] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [error, setError] = useState(null);
  const detectorRef = useRef(null);

  /**
   * Get or create face detector instance
   */
  const getDetector = useCallback(() => {
    if (!detectorRef.current) {
      detectorRef.current = new RNMLKitFaceDetector({
        performanceMode: 'fast',
        landmarkMode: false,
        classificationMode: true,
        minFaceSize: 0.15,
        isTrackingEnabled: false,
      });
    }
    return detectorRef.current;
  }, []);

  /**
   * Detect faces in an image URI
   * @param {string} imageUri - URI of the image to analyze
   * @returns {Promise<Object>} Detection results
   */
  const detectFaces = useCallback(async (imageUri) => {
    if (!imageUri) {
      return { success: false, error: 'No image provided', faces: [] };
    }

    setIsDetecting(true);
    setError(null);

    try {
      const detector = getDetector();
      const result = await detector.detectFaces(imageUri);
      
      console.log('Face detection result:', JSON.stringify(result));
      
      // Handle the result format from RNMLKitFaceDetector
      // Result could be { faces: [...] } or just an array [...]
      let faces = [];
      if (result && result.faces && Array.isArray(result.faces)) {
        faces = result.faces;
      } else if (Array.isArray(result)) {
        faces = result;
      }

      console.log('Parsed faces count:', faces.length);

      const detectionResult = {
        success: true,
        faceCount: Array.isArray(faces) ? faces.length : 0,
        faces: Array.isArray(faces) ? faces.map((face, index) => ({
          id: index,
          frame: face.frame,
          leftEyeOpenProbability: face.hasLeftEyeOpenProbability ? face.leftEyeOpenProbability : null,
          rightEyeOpenProbability: face.hasRightEyeOpenProbability ? face.rightEyeOpenProbability : null,
          smilingProbability: face.hasSmilingProbability ? face.smilingProbability : null,
          trackingId: face.hasTrackingID ? face.trackingID : null,
          headEulerAngleX: face.hasHeadEulerAngleX ? face.headEulerAngleX : null,
          headEulerAngleY: face.hasHeadEulerAngleY ? face.headEulerAngleY : null,
          headEulerAngleZ: face.hasHeadEulerAngleZ ? face.headEulerAngleZ : null,
        })) : [],
        timestamp: Date.now(),
      };

      setLastResult(detectionResult);
      return detectionResult;
    } catch (err) {
      const errorResult = {
        success: false,
        error: err.message || 'Face detection failed',
        faces: [],
        timestamp: Date.now(),
      };
      setError(errorResult.error);
      setLastResult(errorResult);
      return errorResult;
    } finally {
      setIsDetecting(false);
    }
  }, [getDetector]);

  /**
   * Validate face detection results for attendance
   * @param {Object} detectionResult - Result from detectFaces
   * @returns {Object} Validation result with pass/fail and reasons
   */
  const validateForAttendance = useCallback((detectionResult) => {
    if (!detectionResult || !detectionResult.success) {
      return {
        valid: false,
        reason: 'Face detection failed',
        details: detectionResult?.error || 'Unknown error',
      };
    }

    const { faceCount, faces } = detectionResult;

    // Check 1: Face count
    if (faceCount < VALIDATION.MIN_FACE_COUNT) {
      return {
        valid: false,
        reason: 'No face detected',
        details: 'Please position your face in the frame',
      };
    }

    if (faceCount > VALIDATION.MAX_FACE_COUNT) {
      return {
        valid: false,
        reason: 'Multiple faces detected',
        details: 'Please ensure only your face is visible',
      };
    }

    const face = faces[0];
    return {
      valid: true,
      reason: 'Face validated successfully',
      details: {
        faceCount,
        leftEyeOpen: face.leftEyeOpenProbability,
        rightEyeOpen: face.rightEyeOpenProbability,
        smiling: face.smilingProbability,
      },
    };
  }, []);

  /**
   * Detect and validate faces in one call
   * @param {string} imageUri - URI of the image to analyze
   * @returns {Promise<Object>} Combined detection and validation result
   */
  const detectAndValidate = useCallback(async (imageUri) => {
    const detectionResult = await detectFaces(imageUri);
    const validationResult = validateForAttendance(detectionResult);

    return {
      ...detectionResult,
      validation: validationResult,
      passed: validationResult.valid,
    };
  }, [detectFaces, validateForAttendance]);

  /**
   * Clear last detection result
   */
  const clearResult = useCallback(() => {
    setLastResult(null);
    setError(null);
  }, []);

  return {
    detectFaces,
    validateForAttendance,
    detectAndValidate,
    clearResult,
    isDetecting,
    lastResult,
    error,
  };
}

export default useFaceDetection;
